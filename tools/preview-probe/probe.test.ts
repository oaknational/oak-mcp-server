import { createServer, type RequestListener, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterEach, describe, expect, it } from 'vitest';

import { parsePreviewUrl, probe } from './probe.ts';

let server: Server | undefined;

async function serve(listener: RequestListener): Promise<URL> {
  server = createServer(listener);
  await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return new URL(`http://127.0.0.1:${String(port)}/`);
}

afterEach(async () => {
  const running = server;
  server = undefined;
  if (running !== undefined) {
    running.closeAllConnections();
    await new Promise((resolve) => running.close(resolve));
  }
});

const healthy: RequestListener = (request, response) => {
  if (request.method === 'POST' && request.url === '/mcp') {
    response.writeHead(401, { 'www-authenticate': 'Bearer resource_metadata="x"' }).end();
    return;
  }
  response.writeHead(200, { 'content-type': 'application/json' }).end('{}');
};

const fast = { attempts: 2, retryDelayMs: 0, timeoutMs: 1_000 };

describe('probe', () => {
  it('passes when every path answers as expected', async () => {
    const baseUrl = await serve(healthy);
    expect(await probe({ baseUrl, ...fast })).toBe(true);
  });

  it('sends the bypass secret on every request', async () => {
    const seen: (string | undefined)[] = [];
    const baseUrl = await serve((request, response) => {
      seen.push(request.headers['x-vercel-protection-bypass']?.toString());
      healthy(request, response);
    });
    await probe({ baseUrl, bypassSecret: 'invented-bypass', ...fast });
    expect(seen).toEqual([
      'invented-bypass',
      'invented-bypass',
      'invented-bypass',
      'invented-bypass',
    ]);
  });

  it('fails when a path answers 5xx on every attempt', async () => {
    const baseUrl = await serve((request, response) => {
      if (request.url === '/healthz') {
        response.writeHead(503).end();
        return;
      }
      healthy(request, response);
    });
    const lines: string[] = [];
    expect(await probe({ baseUrl, ...fast, log: (line) => lines.push(line) })).toBe(false);
    expect(lines).toContain('attempt 2/2 GET /healthz: expected 200, got 503');
  });

  it('passes when a cold start recovers on a later attempt', async () => {
    let requests = 0;
    const baseUrl = await serve((request, response) => {
      requests += 1;
      if (requests === 1) {
        response.writeHead(500).end();
        return;
      }
      healthy(request, response);
    });
    expect(await probe({ baseUrl, ...fast })).toBe(true);
  });

  it('fails when the deployment does not answer in time', async () => {
    const baseUrl = await serve(() => {});
    const lines: string[] = [];
    const passed = await probe({
      baseUrl,
      attempts: 1,
      retryDelayMs: 0,
      timeoutMs: 50,
      log: (line) => lines.push(line),
    });
    expect(passed).toBe(false);
    expect(lines[0]).toBe('attempt 1/1 GET /healthz: timed out after 50 ms');
  });

  it('fails when /mcp answers 401 without a challenge', async () => {
    const baseUrl = await serve((request, response) => {
      response.writeHead(request.method === 'POST' ? 401 : 200).end();
    });
    expect(await probe({ baseUrl, ...fast, attempts: 1 })).toBe(false);
  });
});

describe('parsePreviewUrl', () => {
  it('accepts an Oak preview origin', () => {
    expect(
      parsePreviewUrl('https://oak-mcp-server-function-abc.vercel.thenational.academy').host,
    ).toBe('oak-mcp-server-function-abc.vercel.thenational.academy');
  });

  it.each([
    'http://oak-mcp-server-function-abc.vercel.thenational.academy',
    'https://example.com',
    'https://vercel.thenational.academy.example.com',
    'https://evil.example/?x=.vercel.thenational.academy',
    'https://oak.vercel.thenational.academy:8443',
    'https://oak.vercel.thenational.academy/path',
    '--upload-pack=x',
    '',
  ])('refuses %j', (raw) => {
    expect(() => parsePreviewUrl(raw)).toThrow();
  });

  it('refuses an origin that carries credentials', () => {
    const withCredentials = new URL('https://oak.vercel.thenational.academy');
    withCredentials.username = 'invented';
    expect(() => parsePreviewUrl(withCredentials.href)).toThrow();
  });
});

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { captureTarget, parseBearerToken } from './surface-diff.ts';

const TOKEN = 'fixture-token.abc_123-XYZ';

let stub: Server;
let endpoint: URL;
let redirectsFollowed = 0;

beforeAll(async () => {
  stub = createServer((req, res) => {
    if (req.url === '/redirect') {
      res.writeHead(307, { location: '/redirected' });
      res.end();
      return;
    }
    if (req.url === '/redirected') {
      redirectsFollowed += 1;
    }
    const authorization = req.headers.authorization ?? '';
    if (authorization !== `Bearer ${TOKEN}`) {
      res.writeHead(401, { 'content-type': 'text/plain' });
      res.end(`rejected ${authorization}`);
      return;
    }
    const server = new McpServer({ name: 'fixture-protected', version: '1.0.0' });
    server.registerTool('fixture-lookup', { description: 'Look up a fixture.' }, () => ({
      content: [],
    }));
    const transport = new StreamableHTTPServerTransport({});
    res.on('close', () => void server.close());
    void server.connect(transport).then(() => transport.handleRequest(req, res));
  });
  await new Promise<void>((resolve) => stub.listen(0, '127.0.0.1', resolve));
  const { port } = stub.address() as AddressInfo;
  endpoint = new URL(`http://127.0.0.1:${String(port)}/mcp`);
});

afterAll(async () => {
  await new Promise((resolve) => stub.close(resolve));
});

describe('surface diff against a protected target', () => {
  it('captures the surface when the bearer token is accepted', async () => {
    const snapshot = await captureTarget(endpoint, TOKEN);
    expect(Object.keys(snapshot.tools)).toEqual(['fixture-lookup']);
  });

  it('fails without a token', async () => {
    await expect(captureTarget(endpoint, undefined)).rejects.toThrow();
  });

  it('keeps a rejected token out of the error, even when the server echoes it', async () => {
    const wrong = 'wrong-token.echoed';
    const error: unknown = await captureTarget(endpoint, wrong).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(Error);
    const text = error instanceof Error ? `${error.message}\n${String(error.stack)}` : '';
    expect(text).toContain('HTTP 401');
    expect(text).toContain('SURFACE_DIFF_BEARER_TOKEN');
    expect(text).not.toContain(wrong);
  });

  it('refuses to send a token over plain http to a remote host', async () => {
    await expect(captureTarget(new URL('http://example.test/mcp'), TOKEN)).rejects.toThrow(/https/);
  });

  it('refuses to send a token to a target with credentials in the URL', async () => {
    const target = new URL(endpoint);
    target.username = 'someone';
    await expect(captureTarget(target, TOKEN)).rejects.toThrow(/https/);
  });

  it('refuses to follow a redirect with the token', async () => {
    const target = new URL(endpoint);
    target.pathname = '/redirect';
    await expect(captureTarget(target, TOKEN)).rejects.toThrow();
    expect(redirectsFollowed).toBe(0);
  });

  it('accepts only an RFC 6750 bearer token', () => {
    expect(parseBearerToken(undefined)).toBeUndefined();
    expect(parseBearerToken(TOKEN)).toBe(TOKEN);
    expect(parseBearerToken('YWJj+/==')).toBe('YWJj+/==');
    for (const bad of ['', ' ', 'two words', 'line\nbreak', 'Bearer\tx', 'a=b']) {
      expect(() => parseBearerToken(bad)).toThrow(/SURFACE_DIFF_BEARER_TOKEN/);
    }
    try {
      parseBearerToken('secret value');
    } catch (error) {
      expect(String(error)).not.toContain('secret value');
    }
  });
});

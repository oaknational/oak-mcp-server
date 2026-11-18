import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { captureTarget, parseBearerToken } from './surface-diff.ts';

const TOKEN = 'canary-Tk.9q_Zx~4/w+==';
const CLI = fileURLToPath(new URL('surface-diff.ts', import.meta.url));
const BASELINE = new URL('baseline.json', import.meta.url);

let stub: Server;
let origin: URL;
const landings: string[] = [];
const getRequests: string[] = [];

const SURFACE_ECHOES = ['raw', 'lower', 'upper', 'base64', 'base64url', 'percent', 'json'] as const;

function surfaceEcho(path: string, authorization: string): string | undefined {
  switch (path) {
    case '/surface-raw':
      return `Look up ${TOKEN}.`;
    case '/surface-lower':
      return `Look up ${TOKEN.toLowerCase()}.`;
    case '/surface-upper':
      return `Look up ${TOKEN.toUpperCase()}.`;
    case '/surface-base64':
      return `Look up ${Buffer.from(authorization).toString('base64')}.`;
    case '/surface-base64url':
      return `Look up ${Buffer.from(authorization).toString('base64url')}.`;
    case '/surface-percent':
      return `Look up ${encodeURIComponent(authorization)}.`;
    case '/surface-json':
      return `Look up ${TOKEN.replaceAll('/', '\\/')}.`;
    default:
      return undefined;
  }
}

function serveMcp(req: IncomingMessage, res: ServerResponse, description: string): void {
  const server = new McpServer({ name: 'fixture-protected', version: '1.0.0' });
  server.registerTool('fixture-lookup', { description }, () => ({
    content: [],
  }));
  const transport = new StreamableHTTPServerTransport({});
  res.on('close', () => void server.close());
  void server.connect(transport).then(() => transport.handleRequest(req, res));
}

const ECHO_PATHS = [
  '/echo-raw',
  '/echo-base64',
  '/echo-percent',
  '/echo-json',
  '/echo-lower',
] as const;

function echoBody(path: string, authorization: string): string | undefined {
  switch (path) {
    case '/echo-raw':
      return `boom ${authorization}`;
    case '/echo-base64':
      return Buffer.from(authorization).toString('base64');
    case '/echo-percent':
      return encodeURIComponent(authorization);
    case '/echo-json':
      return JSON.stringify({ echo: authorization.replaceAll('/', '\\/') });
    case '/echo-lower':
      return authorization.toLowerCase();
    default:
      return undefined;
  }
}

beforeAll(async () => {
  stub = createServer((req, res) => {
    const path = req.url ?? '';
    const authorization = req.headers.authorization ?? '';
    if (path.startsWith('/landing')) {
      landings.push(authorization);
      res.writeHead(404);
      res.end();
      return;
    }
    if (path === '/redirect') {
      res.writeHead(307, { location: '/landing' });
      res.end();
      return;
    }
    if (authorization !== `Bearer ${TOKEN}`) {
      res.writeHead(401, { 'content-type': 'text/plain' });
      res.end(`rejected ${authorization}`);
      return;
    }
    const echo = echoBody(path, authorization);
    if (echo !== undefined) {
      res.writeHead(500, { 'content-type': 'text/plain' });
      res.end(echo);
      return;
    }
    if (path === '/bad-json') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(`{"jsonrpc":"2.0","id":0,"result":${TOKEN}`);
      return;
    }
    if (path === '/get-redirect' && req.method === 'GET') {
      getRequests.push(path);
      res.writeHead(302, { location: '/landing-sse' });
      res.end();
      return;
    }
    serveMcp(req, res, surfaceEcho(path, authorization) ?? 'Look up a fixture.');
  });
  await new Promise<void>((resolve) => stub.listen(0, '127.0.0.1', resolve));
  const { port } = stub.address() as AddressInfo;
  origin = new URL(`http://127.0.0.1:${String(port)}`);
});

afterAll(async () => {
  await new Promise((resolve) => stub.close(resolve));
});

const at = (path: string) => new URL(path, origin);

async function failureOf(promise: Promise<unknown>): Promise<string> {
  const error: unknown = await promise.then(
    () => undefined,
    (caught: unknown) => caught,
  );
  if (!(error instanceof Error)) {
    throw new Error('expected the capture to fail');
  }
  return `${error.message}\n${String(error.stack)}`;
}

async function runCli(args: readonly string[], token: string | undefined) {
  const env = { ...process.env };
  delete env['SURFACE_DIFF_BEARER_TOKEN'];
  if (token !== undefined) {
    env['SURFACE_DIFF_BEARER_TOKEN'] = token;
  }
  const child = spawn(process.execPath, [CLI, ...args], { env });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
  child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
  const [status] = (await once(child, 'close')) as [number | null];
  return { status, stdout, stderr, output: `${stdout}${stderr}` };
}

describe('surface diff against a protected target', () => {
  it('captures the surface when the bearer token is accepted', async () => {
    const snapshot = await captureTarget(at('/mcp'), TOKEN);
    expect(Object.keys(snapshot.tools)).toEqual(['fixture-lookup']);
  });

  it('fails without a token and names the status', async () => {
    expect(await failureOf(captureTarget(at('/mcp'), undefined))).toContain('HTTP 401');
  });

  it('prints a fixed message when the target refuses the token', async () => {
    const wrong = 'wrong-token.echoed';
    const text = await failureOf(captureTarget(at('/mcp'), wrong));
    expect(text).toContain('HTTP 401');
    expect(text).toContain('SURFACE_DIFF_BEARER_TOKEN');
    expect(text).not.toContain('wrong');
  });

  it.each(ECHO_PATHS)('prints only the status for a 500 at %s', async (path) => {
    const text = await failureOf(captureTarget(at(path), TOKEN));
    expect(text.split('\n')[0]).toBe('HTTP 500');
    expect(text.toLowerCase()).not.toContain('canary');
    expect(text).not.toContain(Buffer.from('Bearer canary').toString('base64').slice(0, 12));
  });

  it('prints a fixed class for a response it cannot parse', async () => {
    const text = await failureOf(captureTarget(at('/bad-json'), TOKEN));
    expect(text.split('\n')[0]).toBe('invalid response');
    expect(text.toLowerCase()).not.toContain('canary');
  });

  it('refuses to send a token over plain http to a remote host', async () => {
    await expect(captureTarget(new URL('http://example.test/mcp'), TOKEN)).rejects.toThrow(/https/);
  });

  it('refuses to send a token to a target with credentials in the URL', async () => {
    const target = at('/mcp');
    target.username = 'someone';
    await expect(captureTarget(target, TOKEN)).rejects.toThrow(/https/);
  });

  it('refuses to follow a POST redirect with the token', async () => {
    landings.length = 0;
    await expect(captureTarget(at('/redirect'), TOKEN)).rejects.toThrow();
    expect(landings).toEqual([]);
  });

  it('refuses to follow a same-origin GET event-stream redirect with the token', async () => {
    landings.length = 0;
    getRequests.length = 0;
    await captureTarget(at('/get-redirect'), TOKEN).catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(getRequests.length).toBeGreaterThan(0);
    expect(landings).toEqual([]);
  });

  it('accepts only an RFC 6750 bearer token', () => {
    expect(parseBearerToken(undefined)).toBeUndefined();
    expect(parseBearerToken(TOKEN)).toBe(TOKEN);
    for (const bad of ['', ' ', 'two words', 'line\nbreak', 'Bearer\tx', 'a=b']) {
      expect(() => parseBearerToken(bad)).toThrow(/SURFACE_DIFF_BEARER_TOKEN/);
    }
    expect(() => parseBearerToken('secret value')).toThrow(
      /^SURFACE_DIFF_BEARER_TOKEN is not a valid bearer token$/,
    );
  });

  it('refuses --write-baseline while a token is set and leaves the baseline alone', async () => {
    const before = readFileSync(BASELINE, 'utf8');
    const result = await runCli(
      ['--target', at('/mcp').href, '--write-baseline', 'fixture'],
      TOKEN,
    );
    expect(result.status).toBe(2);
    expect(result.output).toContain('--write-baseline');
    expect(result.output.toLowerCase()).not.toContain('canary');
    expect(readFileSync(BASELINE, 'utf8')).toBe(before);
  });

  it('prints the report when the surface does not carry the token', async () => {
    const result = await runCli(['--target', at('/mcp').href], TOKEN);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('added tool "fixture-lookup"');
  });

  it.each(SURFACE_ECHOES)(
    'suppresses the report when a tool description carries the token (%s)',
    async (kind) => {
      const result = await runCli(['--target', at(`/surface-${kind}`).href], TOKEN);
      expect(result.status).toBe(2);
      expect(result.stdout).toBe('');
      expect(result.stderr).toBe(
        "surface-diff: the target's response contains the bearer token; report suppressed\n",
      );
    },
  );
});

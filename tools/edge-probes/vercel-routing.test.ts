import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it } from 'vitest';

import { startDocsStub, startServerStub, type StubOrigin } from './stub-origins.ts';
import { route, startVercelFront, type VercelConfig } from './vercel-routing.ts';

const SCRIPT = fileURLToPath(new URL('probes.sh', import.meta.url));
const EXPECTED = readFileSync(new URL('expected.txt', import.meta.url), 'utf8')
  .trim()
  .split('\n');
const CONFIG = JSON.parse(
  readFileSync(new URL('../../apps/docs/vercel.json', import.meta.url), 'utf8'),
) as VercelConfig;
const DOCS_PAGES = ['/', '/tools/'];
const PRODUCTION_HOST = 'mcp.thenational.academy';

const rewrites = CONFIG.rewrites ?? [];
const serverOrigins = [...new Set(rewrites.map(({ destination }) => new URL(destination).origin))];

interface Run {
  readonly code: number;
  readonly lines: readonly string[];
}

async function probe(host: string): Promise<Run> {
  try {
    const { stdout } = await promisify(execFile)('sh', [SCRIPT, host]);
    return { code: 0, lines: stdout.trim().split('\n') };
  } catch (error) {
    const { code, stdout } = error as { code: number; stdout: string };
    return { code, lines: stdout.trim().split('\n') };
  }
}

const running: StubOrigin[] = [];

async function startHost(config: VercelConfig, docsFiles: readonly string[] = DOCS_PAGES) {
  const [server, docs] = await Promise.all([startServerStub(), startDocsStub(docsFiles)]);
  const origins = new Map(serverOrigins.map((origin) => [origin, server.url]));
  const files = new Set(docsFiles);
  const front = await startVercelFront(config, docs, origins, (path) => files.has(path));
  running.push(server, docs, front);
  return { server, docs, front };
}

afterEach(async () => {
  await Promise.all(running.splice(0).map((origin) => origin.close()));
});

describe('apps/docs/vercel.json', () => {
  it('sends every server path to the server and the rest to the docs', async () => {
    const { front } = await startHost(CONFIG);

    const run = await probe(front.url);

    expect(run.lines).toStrictEqual(EXPECTED);
    expect(run.code).toBe(0);
  });

  it('rewrites to one server origin, which is not the production host', () => {
    expect(serverOrigins).toHaveLength(1);
    expect(new URL(serverOrigins[0] ?? '').host).not.toBe(PRODUCTION_HOST);
  });

  it('turns off rewrite caching on every rewritten path', () => {
    const optedOut = (CONFIG.headers ?? [])
      .filter(({ headers }) =>
        headers.some(
          ({ key, value }) => key === 'x-vercel-enable-rewrite-caching' && value === '0',
        ),
      )
      .map(({ source }) => source);

    expect(optedOut).toStrictEqual(rewrites.map(({ source }) => source));
  });

  it('names each /.well-known/ path the server owns instead of the whole prefix', () => {
    const wellKnown = rewrites.filter(({ source }) => source.startsWith('/.well-known/'));

    expect(wellKnown.length).toBeGreaterThan(0);
    for (const { source } of wellKnown) expect(source).not.toMatch(/[:*(]/);
    expect(route(CONFIG, '/.well-known/acme-challenge/token', () => false)).toStrictEqual({
      kind: 'filesystem',
    });
  });

  it('would break POST /mcp if it redirected paths to a trailing slash', async () => {
    const { front } = await startHost({ ...CONFIG, trailingSlash: true });

    const run = await probe(front.url);

    expect(run.lines).toContain(
      "FAIL mcp-post: POST /mcp: status 308, want 401; content-type '', want application/json",
    );
    expect(CONFIG.trailingSlash).toBeUndefined();
  });

  it('lets a docs file at a server path shadow the rewrite', async () => {
    const { front } = await startHost(CONFIG, [...DOCS_PAGES, '/robots.txt']);

    const run = await probe(front.url);

    expect(run.lines.filter((line) => line.startsWith('FAIL'))).toStrictEqual([
      "FAIL robots-txt: GET /robots.txt: content-type 'text/html; charset=utf-8', want text/plain; answered by docs, want server",
    ]);
  });
});

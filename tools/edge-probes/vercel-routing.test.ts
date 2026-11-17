import { execFile } from 'node:child_process';
import { request } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it } from 'vitest';

import { startDocsStub, startServerStub, type StubOrigin } from './stub-origins.ts';
import {
  route,
  SERVER_PATHS,
  serverRewrites,
  startVercelFront,
  type VercelConfig,
} from './vercel-routing.ts';

const SCRIPT = fileURLToPath(new URL('probes.sh', import.meta.url));
const EXPECTED = readFileSync(new URL('expected.txt', import.meta.url), 'utf8')
  .trim()
  .split('\n');
const SERVER_ORIGIN = 'https://server.test';
const CONFIG = serverRewrites(SERVER_ORIGIN);
const DOCS_PAGES = ['/', '/tools/'];

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
  const files = new Set(docsFiles);
  const front = await startVercelFront(
    config,
    docs,
    new Map([[SERVER_ORIGIN, server.url]]),
    (path) => files.has(path),
  );
  running.push(server, docs, front);
  return { server, docs, front };
}

afterEach(async () => {
  await Promise.all(running.splice(0).map((origin) => origin.close()));
});

describe('rewriting server-paths.json the way Vercel documents', () => {
  it('sends every server path to the server and the rest to the docs', async () => {
    const { front } = await startHost(CONFIG);

    const run = await probe(front.url);

    expect(run.lines).toStrictEqual(EXPECTED);
    expect(run.code).toBe(0);
  });

  it('names each /.well-known/ path the server owns instead of the whole prefix', () => {
    const wellKnown = SERVER_PATHS.filter((path) => path.startsWith('/.well-known/'));

    expect(wellKnown.length).toBeGreaterThan(0);
    for (const path of wellKnown) expect(path).not.toMatch(/[:*(]/);
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
  });

  it('lets a docs file at a server path shadow the rewrite', async () => {
    const { front } = await startHost(CONFIG, [...DOCS_PAGES, '/robots.txt']);

    const run = await probe(front.url);

    expect(run.lines.filter((line) => line.startsWith('FAIL'))).toStrictEqual([
      "FAIL robots-txt: GET /robots.txt: content-type 'text/html; charset=utf-8', want text/plain; answered by docs, want server",
    ]);
  });

  it('forwards only to the origins it was given', async () => {
    const { front } = await startHost(CONFIG);
    const outsider = await startServerStub();
    running.push(outsider);
    const { port } = new URL(outsider.url);

    for (const path of [`//127.0.0.1:${port}/healthz`, `/mcp/..//127.0.0.1:${port}/healthz`]) {
      await new Promise<void>((resolve) => {
        request(front.url, { path }, (response) => {
          response.resume().on('end', resolve);
        }).end();
      });
    }

    expect(outsider.requests).toStrictEqual([]);
  });
});

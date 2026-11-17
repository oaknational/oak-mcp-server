import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startDocsStub, startServerStub, type StubOrigin } from './stub-origins.ts';

const SCRIPT = fileURLToPath(new URL('probes.sh', import.meta.url));
const EXPECTED = readFileSync(new URL('expected.txt', import.meta.url), 'utf8')
  .trim()
  .split('\n');
const NAMES = EXPECTED.map((line) => line.replace(/^ok /, ''));
const DOCS_PROBES = [
  'docs-root',
  'docs-root-any-accept',
  'docs-tools',
  'docs-mcpfoo',
  'docs-mcp-not-a-path',
];
const SERVER_PROBES = NAMES.filter((name) => !DOCS_PROBES.includes(name));

const ADR_0004_PATHS: readonly RegExp[] = [
  /^\/mcp$/,
  /^\/mcp\/.+/,
  /^\/oauth\/register$/,
  /^\/oauth\/authorize$/,
  /^\/oauth\/token$/,
  /^\/\.well-known\/oauth-protected-resource$/,
  /^\/\.well-known\/oauth-protected-resource\/mcp$/,
  /^\/\.well-known\/oauth-authorization-server$/,
  /^\/\.well-known\/openai-apps-challenge$/,
  /^\/robots\.txt$/,
  /^\/assets\/download\/[^/]+\/[^/]+$/,
  /^\/api\/cron\/refresh-graph$/,
  /^\/healthz$/,
  /^\/mcp\/healthz$/,
  /^\/favicons\/.+/,
  /^\/carousel\/.+/,
  /^\/oak-ds\/.+/,
  /^\/oak-assets\/.+/,
];

interface Run {
  readonly code: number;
  readonly lines: readonly string[];
  readonly stderr: string;
}

async function probe(...args: string[]): Promise<Run> {
  try {
    const { stdout, stderr } = await promisify(execFile)('sh', [SCRIPT, ...args]);
    return { code: 0, lines: stdout.trim().split('\n'), stderr };
  } catch (error) {
    const { code, stdout, stderr } = error as { code: number; stdout: string; stderr: string };
    return { code, lines: stdout.trim().split('\n').filter(Boolean), stderr };
  }
}

const verdicts = (run: Run): Map<string, string> =>
  new Map(run.lines.map((line) => [line.split(/[ :]/)[1] ?? '', line.split(' ')[0] ?? '']));

const okNames = (run: Run): string[] =>
  [...verdicts(run)].filter(([, verdict]) => verdict === 'ok').map(([name]) => name);

describe('probes.sh', () => {
  let server: StubOrigin;
  let docs: StubOrigin;
  let serverRun: Run;
  let docsRun: Run;

  beforeAll(async () => {
    [server, docs] = await Promise.all([startServerStub(), startDocsStub()]);
    [serverRun, docsRun] = await Promise.all([probe(server.url), probe(docs.url)]);
  });

  afterAll(async () => {
    await Promise.all([server.close(), docs.close()]);
  });

  it('prints one ok or FAIL line per probe in expected.txt, in order', () => {
    for (const run of [serverRun, docsRun]) {
      expect(run.lines.map((line) => line.split(/[ :]/)[1])).toStrictEqual(NAMES);
      for (const line of run.lines) expect(line).toMatch(/^(?:ok \S+|FAIL \S+: .+)$/);
    }
  });

  it('passes every server probe and fails every docs probe on the server alone', () => {
    expect(okNames(serverRun)).toStrictEqual(SERVER_PROBES);
    expect(serverRun.code).toBe(1);
  });

  it('passes every docs probe and fails every server probe on the docs alone', () => {
    expect(okNames(docsRun)).toStrictEqual(DOCS_PROBES);
    expect(docsRun.code).toBe(1);
  });

  it('says why a probe failed', () => {
    expect(verdicts(docsRun).get('mcp-post')).toBe('FAIL');
    expect(docsRun.lines).toContain(
      "FAIL mcp-post: POST /mcp: status 404, want 401; content-type 'text/html; charset=utf-8', want application/json; answered by docs, want server",
    );
  });

  it('requests a path in every entry of the ADR 0004 list', () => {
    for (const pattern of ADR_0004_PATHS) {
      expect(
        server.requests.some((path) => pattern.test(path)),
        String(pattern),
      ).toBe(true);
    }
  });

  it('fails every probe when the host does not answer', async () => {
    const run = await probe('http://127.0.0.1:9');
    expect(run.code).toBe(1);
    expect(okNames(run)).toStrictEqual([]);
    expect(run.lines).toHaveLength(NAMES.length);
  });

  it('refuses to run without exactly one host', async () => {
    const run = await probe();
    expect(run.code).toBe(2);
    expect(run.stderr).toMatch(/^usage: /);
  });
});

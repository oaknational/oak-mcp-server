import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const script = join(import.meta.dirname, 'docs-shadowing.ts');
const docsOut = join(import.meta.dirname, '../../apps/docs/out');
let out = '';

function run(dir: string): { status: number | null; stdout: string; stderr: string } {
  return spawnSync('node', [script, dir], { encoding: 'utf8' });
}

function write(relative: string): void {
  mkdirSync(dirname(join(out, relative)), { recursive: true });
  writeFileSync(join(out, relative), '');
}

beforeEach(() => {
  out = mkdtempSync(join(tmpdir(), 'docs-shadowing-'));
  write('index.html');
  write('tools/index.html');
  write('_next/static/chunk.js');
});

afterEach(() => {
  rmSync(out, { recursive: true, force: true });
});

describe('docs-shadowing', () => {
  it('passes on the built docs export', () => {
    const result = run(docsOut);

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
  });

  it('passes on an export with no file at a server path', () => {
    expect(run(out).status).toBe(0);
  });

  it.each([
    ['robots.txt', '/robots.txt'],
    ['healthz', '/healthz'],
    ['mcp/index.html', '/mcp'],
    ['oak-ds/styles.css', '/oak-ds'],
    ['.well-known/oauth-authorization-server', '/.well-known/oauth-authorization-server'],
    ['assets/download/lesson/worksheet', '/assets/download/lesson/worksheet'],
  ])('fails when the export writes %s', (file, path) => {
    write(file);

    const result = run(out);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(path);
  });

  it('ignores near misses of server paths', () => {
    write('mcpfoo/index.html');
    write('oauth.html');

    expect(run(out).status).toBe(0);
  });

  it('fails when the export is missing', () => {
    const result = run(join(out, 'missing'));

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/build the docs/i);
  });
});

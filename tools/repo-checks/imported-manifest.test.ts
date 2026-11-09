import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { importedManifestProblems } from './imported-manifest.ts';

const root = join(import.meta.dirname, '..', '..');
const MANIFEST = 'tools/import-from-ooce/imported.json';
const HASH = 'a'.repeat(64);
const SECRET = ['ghp_', 'a1B2c3D4e5F6g7H8i9J0kLmNoPqRsTuVwXyZ'].join('');
const hasGitleaks = spawnSync('gitleaks', ['version']).status === 0;

function manifest(files: Record<string, unknown>, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({ files, ...extra });
}

describe('import manifest content', () => {
  it('accepts paths mapped to lowercase SHA-256 hashes', () => {
    expect(importedManifestProblems(manifest({ 'packages/env/src/index.ts': HASH }))).toEqual([]);
    expect(importedManifestProblems(manifest({}))).toEqual([]);
  });

  it.each([
    ['a second key', manifest({}, { token: 'x' })],
    ['an array', '[]'],
    ['invalid JSON', '{'],
    ['files as an array', '{"files": []}'],
    ['a short hash', manifest({ 'a.ts': 'a'.repeat(63) })],
    ['an uppercase hash', manifest({ 'a.ts': 'A'.repeat(64) })],
    ['a secret-shaped value', manifest({ 'a.ts': SECRET })],
    ['a non-string value', manifest({ 'a.ts': 1 })],
    ['a path holding a secret-shaped string', manifest({ 'a b=c+d': HASH })],
    ['a parent path', manifest({ '../a.ts': HASH })],
  ])('rejects %s', (_label, raw) => {
    expect(importedManifestProblems(raw)).not.toEqual([]);
  });

  it('holds for the committed manifest', () => {
    const path = join(root, MANIFEST);
    if (existsSync(path)) {
      expect(importedManifestProblems(readFileSync(path, 'utf8'))).toEqual([]);
    }
  });
});

describe.skipIf(!hasGitleaks)('secret scan allowlist', () => {
  let scratch = '';

  afterEach(() => {
    rmSync(scratch, { recursive: true, force: true });
  });

  function scan(files: Record<string, string>): number | null {
    scratch = mkdtempSync(join(tmpdir(), 'allowlist-'));
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(dirname(join(scratch, path)), { recursive: true });
      writeFileSync(join(scratch, path), text);
    }
    return spawnSync('gitleaks', [
      'dir',
      scratch,
      '--config',
      join(root, '.gitleaks.toml'),
      '--no-banner',
      '--exit-code',
      '1',
    ]).status;
  }

  const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex');
  const entries = {
    'packages/env/src/schemas/sentry.ts': sha256('sentry'),
    'packages/env/src/schemas/oak-api.ts': sha256('oak-api'),
  };

  it('passes the import manifest', () => {
    expect(scan({ [MANIFEST]: manifest(entries) })).toBe(0);
  });

  it('still catches a secret in any other file', () => {
    expect(
      scan({ [MANIFEST]: manifest(entries), 'src/config.ts': `const aws = '${SECRET}';\n` }),
    ).toBe(1);
  });

  it('still catches a secret written into a manifest-named file elsewhere', () => {
    expect(scan({ 'tools/other/imported.json': manifest({ 'a.ts': SECRET }) })).toBe(1);
  });
});

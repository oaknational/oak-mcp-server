import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

const script = join(import.meta.dirname, 'no-accidental-major.ts');
const dir = mkdtempSync(join(tmpdir(), 'no-major-'));
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

function check(message: string): { status: number | null; stderr: string } {
  const file = join(dir, 'COMMIT_EDITMSG');
  writeFileSync(file, message);
  const { status, stderr } = spawnSync('node', [script, file], { encoding: 'utf8' });
  return { status, stderr };
}

describe('no-accidental-major', () => {
  it('rejects a ! after the type', () => {
    const result = check('feat(server)!: x\n');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('no-accidental-major');
  });

  it('rejects a ! after the type behind a Linear id', () => {
    expect(check('MCP-1: feat(server)!: add tool\n').status).toBe(1);
  });

  it('rejects a BREAKING CHANGE footer', () => {
    const result = check('feat(server): x\n\nBREAKING CHANGE: the tool moved\n');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('BREAKING CHANGE');
  });

  it('accepts a Linear id with a plain conventional header', () => {
    expect(check('MCP-1: feat(server): x\n').status).toBe(0);
  });

  it('ignores git comment lines', () => {
    expect(check('fix: x\n\n# BREAKING CHANGE is a comment\n').status).toBe(0);
  });
});

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const script = join(import.meta.dirname, 'scrub-staged.ts');
const fixtureScrubList = [
  '# Fixture instructions',
  '',
  '## Scrub list for anything committed',
  '',
  '- `zorblax-codename`',
  '- the operator real name, not a pattern',
  '',
  '## Another section',
  '',
  '- `unrelated-term`',
  '',
].join('\n');

let repo = '';

function email(local: string, domain: string): string {
  return [local, domain].join('@');
}

function git(...args: string[]): void {
  execFileSync('git', args, { cwd: repo, stdio: 'ignore' });
}

function stage(file: string, content: string): void {
  writeFileSync(join(repo, file), content);
  git('add', file);
}

function scrub(): { status: number | null; stderr: string } {
  const { status, stderr } = spawnSync('node', [script], { cwd: repo, encoding: 'utf8' });
  return { status, stderr };
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'scrub-'));
  git('init', '--quiet');
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe('scrub-staged', () => {
  it('fails on a staged email address and names the file', () => {
    stage('notes.md', `contact: ${email('jane.doe', 'example.org')}\n`);
    const result = scrub();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('notes.md:1 contains an email address');
  });

  it('fails on a pattern from the local scrub list and names the file', () => {
    writeFileSync(join(repo, 'CLAUDE.local.md'), fixtureScrubList);
    stage('doc.md', 'line one\nthe Zorblax-Codename project\n');
    const result = scrub();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('doc.md:2 matches a pattern from the local scrub list');
    expect(result.stderr).not.toContain('zorblax');
  });

  it('ignores terms outside the scrub list section', () => {
    writeFileSync(join(repo, 'CLAUDE.local.md'), fixtureScrubList);
    stage('doc.md', 'mentions unrelated-term only\n');
    expect(scrub().status).toBe(0);
  });

  it('passes clean content with no local file', () => {
    stage('doc.md', 'nothing personal here\n');
    expect(scrub().status).toBe(0);
  });

  it('applies the generic rule when no local file exists', () => {
    stage('doc.md', `a ${email('someone', 'example.com')} b\n`);
    expect(scrub().status).toBe(1);
  });
});

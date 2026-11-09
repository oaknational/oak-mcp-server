import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
  '- `alpha-term` and `beta-term` things',
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

function scrub(cwd = repo): { status: number | null; stderr: string } {
  const { status, stderr } = spawnSync('node', [script], { cwd, encoding: 'utf8' });
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

  it('reads every backticked term on a scrub list line', () => {
    writeFileSync(join(repo, 'CLAUDE.local.md'), fixtureScrubList);
    stage('first.md', 'has alpha-term\n');
    expect(scrub().stderr).toContain('first.md:1 matches');
    git('reset', '--quiet');
    stage('second.md', 'has beta-term\n');
    expect(scrub().stderr).toContain('second.md:1 matches');
  });

  it('uses the main checkout scrub list from a linked worktree', () => {
    writeFileSync(join(repo, 'CLAUDE.local.md'), fixtureScrubList);
    git(
      '-c',
      'user.name=fixture',
      '-c',
      'user.email=fixture',
      'commit',
      '--quiet',
      '--allow-empty',
      '-m',
      'init',
    );
    const linked = join(repo, 'linked');
    git('worktree', 'add', '--quiet', linked, '-b', 'topic');
    writeFileSync(join(linked, 'doc.md'), 'the zorblax-codename project\n');
    execFileSync('git', ['add', 'doc.md'], { cwd: linked });
    const result = scrub(linked);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('doc.md:1 matches a pattern from the local scrub list');
  });

  it.each([
    ['diff.mnemonicPrefix', 'true'],
    ['diff.noprefix', 'true'],
  ])('finds an email when %s is set', (key, value) => {
    git('config', key, value);
    stage('notes.md', `contact: ${email('jane.doe', 'example.org')}\n`);
    expect(scrub().stderr).toContain('notes.md:1 contains an email address');
  });

  it.each(['café.txt', 'has space.txt', 'q"uote.txt'])('names and scans the file %s', (name) => {
    stage(name, `contact: ${email('jane.doe', 'example.org')}\n`);
    const result = scrub();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`  ${name}:1 contains an email address\n`);
  });

  it('scans an added line that starts with two plus signs and a space', () => {
    stage('pp.txt', `++ header\n${email('jane.doe', 'example.org')}\n`);
    expect(scrub().stderr).toContain('pp.txt:2 contains an email address');
  });

  it('scans a binary file that holds text', () => {
    stage('data.bin', `\0${email('jane.doe', 'example.org')}\n`);
    expect(scrub().status).toBe(1);
  });

  it('scans staged content when run from a subdirectory', () => {
    mkdirSync(join(repo, 'sub'));
    stage('sub/notes.md', `contact: ${email('jane.doe', 'example.org')}\n`);
    const result = scrub(join(repo, 'sub'));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('sub/notes.md:1 contains an email address');
  });

  it('scans staged content from a subdirectory when diff.relative is set', () => {
    git('config', 'diff.relative', 'true');
    mkdirSync(join(repo, 'sub'));
    stage('sub/notes.md', `contact: ${email('jane.doe', 'example.org')}\n`);
    const result = scrub(join(repo, 'sub'));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('sub/notes.md:1 contains an email address');
  });

  it('says when no scrub list is found, without printing paths or terms', () => {
    stage('doc.md', 'nothing personal here\n');
    const result = scrub();
    expect(result.status).toBe(0);
    expect(result.stderr).toBe(
      'scrub-staged: no CLAUDE.local.md scrub list found; checking email addresses only\n',
    );
  });

  it('stays quiet when a scrub list is found', () => {
    writeFileSync(join(repo, 'CLAUDE.local.md'), fixtureScrubList);
    stage('doc.md', 'nothing personal here\n');
    expect(scrub().stderr).toBe('');
  });

  it('refuses a staged file name that matches the scrub list without printing it', () => {
    writeFileSync(join(repo, 'CLAUDE.local.md'), fixtureScrubList);
    stage('notes-zorblax-codename.md', 'nothing personal here\n');
    const result = scrub();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('a staged file name matches the scrub list');
    expect(result.stderr).not.toContain('zorblax');
    expect(result.stderr).not.toContain('notes-');
  });

  it('hides the path of a matching file when it also has a content finding', () => {
    writeFileSync(join(repo, 'CLAUDE.local.md'), fixtureScrubList);
    stage('alpha-term.md', `contact: ${email('jane.doe', 'example.org')}\n`);
    const result = scrub();
    expect(result.stderr).toContain('(path hidden):1 contains an email address');
    expect(result.stderr).not.toContain('alpha-term');
  });

  it('gives one refusal line with a count when several file names match', () => {
    writeFileSync(join(repo, 'CLAUDE.local.md'), fixtureScrubList);
    for (const name of ['a-alpha-term.md', 'b-alpha-term.md', 'c-beta-term.md']) {
      stage(name, 'nothing personal here\n');
    }
    const result = scrub();
    expect(result.status).toBe(1);
    const lines = result.stderr.split('\n').filter((line) => line.includes('file name'));
    expect(lines).toEqual(['  3 staged file names match the scrub list']);
    expect(result.stderr).not.toContain('alpha-term');
  });

  describe('with a staged submodule and line-break characters in file content', () => {
    const innerSha = '1'.repeat(40);

    function stageGitlink(): void {
      git('update-index', '--add', '--cacheinfo', `160000,${innerSha},zsub`);
    }

    it.each([
      ['a carriage return', '\r'],
      ['a line separator', '\u2028'],
      ['a paragraph separator', '\u2029'],
    ])('finds an email after %s that precedes a fake diff header', (_name, separator) => {
      git('config', 'diff.submodule', 'log');
      stageGitlink();
      stage('a.txt', `x${separator}diff --git a/q b/q\n${email('jane.doe', 'example.org')}\n`);
      const result = scrub();
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('a.txt:2 contains an email address');
      expect(result.stderr).not.toContain('    at ');
    });

    it.each(['log', 'diff', 'short'])('finds an email when diff.submodule is %s', (mode) => {
      git('config', 'diff.submodule', mode);
      stageGitlink();
      stage('a.txt', `${email('jane.doe', 'example.org')}\n`);
      const result = scrub();
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('a.txt:1 contains an email address');
      expect(result.stderr).not.toContain('    at ');
    });

    it('finds an email after a carriage return that precedes a fake diff header, without a submodule', () => {
      stage('a.txt', `x\rdiff --git a/q b/q\n${email('jane.doe', 'example.org')}\n`);
      const result = scrub();
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('a.txt:2 contains an email address');
      expect(result.stderr).not.toContain('    at ');
    });
  });

  it('scans 2,000 staged files in under one second', () => {
    const count = 2000;
    mkdirSync(join(repo, 'bulk'));
    for (let index = 0; index < count; index += 1) {
      writeFileSync(join(repo, 'bulk', `file-${String(index)}.txt`), `line ${String(index)}\n`);
    }
    writeFileSync(join(repo, 'bulk', 'file-1999.txt'), `${email('jane.doe', 'example.org')}\n`);
    git('add', 'bulk');
    const started = performance.now();
    const result = scrub();
    const elapsed = performance.now() - started;
    expect(result.stderr).toContain('bulk/file-1999.txt:1 contains an email address');
    expect(elapsed).toBeLessThan(1000);
  }, 60_000);
});

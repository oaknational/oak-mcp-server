import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const root = join(import.meta.dirname, '..', '..');
const hasGitleaks = spawnSync('gitleaks', ['version']).status === 0;
const NULL_SHA = '0'.repeat(40);

let repo = '';

function git(...args: string[]): string {
  return execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], {
    cwd: repo,
    encoding: 'utf8',
  }).trim();
}

function commit(message: string): void {
  git('commit', '-q', '-m', message);
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'hooks-'));
  git('init', '-q', '-b', 'main');
  git('config', 'user.name', 'fixture');
  git('config', 'user.email', 'fixture');
  mkdirSync(join(repo, '.husky'));
  mkdirSync(join(repo, 'tools'));
  for (const file of [
    'applypatch-msg',
    'commit-msg',
    'pre-applypatch',
    'pre-merge-commit',
    'pre-push',
    'refuse-commit-on-main.sh',
  ]) {
    copyFileSync(join(root, '.husky', file), join(repo, '.husky', file));
  }
  for (const file of ['commitlint.config.mjs', 'package.json', '.gitleaks.toml']) {
    copyFileSync(join(root, file), join(repo, file));
  }
  symlinkSync(join(root, 'node_modules'), join(repo, 'node_modules'));
  symlinkSync(join(root, 'tools', 'repo-checks'), join(repo, 'tools', 'repo-checks'));
  git('add', '.husky', 'commitlint.config.mjs', 'package.json', '.gitleaks.toml');
  commit('chore: init');
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

function stubPreCommit(exitCode: number): void {
  writeFileSync(
    join(repo, '.husky', 'pre-commit'),
    `#!/usr/bin/env sh\nexit ${String(exitCode)}\n`,
    { mode: 0o755 },
  );
}

function apply(message: string, preCommitExit = 0): number | null {
  stubPreCommit(preCommitExit);
  git('switch', '-q', '-c', 'topic');
  writeFileSync(join(repo, 'file.txt'), 'content\n');
  git('add', 'file.txt');
  commit(message);
  const patch = join(repo, '..', `${String(Date.now())}.patch`);
  writeFileSync(patch, git('format-patch', '-1', '--stdout') + '\n');
  git('reset', '-q', '--hard', 'HEAD~1');
  const { status } = spawnSync('git', ['-c', 'core.hooksPath=.husky', 'am', patch], {
    cwd: repo,
    encoding: 'utf8',
  });
  rmSync(patch);
  return status;
}

function merge(preCommitExit: number): number | null {
  stubPreCommit(preCommitExit);
  git('switch', '-q', '-c', 'topic');
  writeFileSync(join(repo, 'topic.txt'), 'topic\n');
  git('add', 'topic.txt');
  commit('feat(repo): add topic');
  git('switch', '-q', 'main');
  git('switch', '-q', '-c', 'other');
  writeFileSync(join(repo, 'other.txt'), 'other\n');
  git('add', 'other.txt');
  commit('feat(repo): add other');
  const { status } = spawnSync(
    'git',
    ['-c', 'core.hooksPath=.husky', 'merge', '--no-ff', '-m', 'chore(repo): merge topic', 'topic'],
    { cwd: repo, encoding: 'utf8' },
  );
  return status;
}

describe('applypatch-msg', () => {
  it('refuses a patch whose message is not conventional', () => {
    expect(apply('not conventional')).not.toBe(0);
  });

  it('accepts a patch whose message is conventional', () => {
    expect(apply('feat(repo): add file')).toBe(0);
  });
});

describe('pre-applypatch', () => {
  it('refuses a conventional patch when the pre-commit gate fails', () => {
    expect(apply('feat(repo): add file', 1)).not.toBe(0);
  });
});

describe('pre-merge-commit', () => {
  it('refuses a merge commit when the pre-commit gate fails', () => {
    expect(merge(1)).not.toBe(0);
  });

  it('allows a merge commit when the pre-commit gate passes', () => {
    expect(merge(0)).toBe(0);
  });
});

describe.skipIf(!hasGitleaks)('pre-push secret scan', () => {
  it('scans the full local history when the push targets a URL', () => {
    git('switch', '-q', '-c', 'topic');
    const token = ['ghp', 'aB3dE5gH7jK9mN1pQ3sT5vX7zA9cD1fG3hJ5'].join('_');
    writeFileSync(join(repo, 'leak.txt'), `token=${token}\n`);
    git('add', 'leak.txt');
    commit('chore: add leak');
    const sha = git('rev-parse', 'HEAD');
    git('update-ref', 'refs/remotes/other/topic', sha);
    const { status } = spawnSync('sh', ['.husky/pre-push', 'https://example.invalid/repo.git'], {
      cwd: repo,
      input: `refs/heads/topic ${sha} refs/heads/topic ${NULL_SHA}\n`,
      encoding: 'utf8',
    });
    expect(status).toBe(1);
  });
});

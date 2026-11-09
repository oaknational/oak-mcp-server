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
  git('-c', 'user.name=fixture', '-c', 'user.email=fixture', 'commit', '-q', '-m', message);
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'hooks-'));
  git('init', '-q', '-b', 'main');
  mkdirSync(join(repo, '.husky'));
  mkdirSync(join(repo, 'tools'));
  for (const file of ['applypatch-msg', 'commit-msg', 'pre-push', 'refuse-commit-on-main.sh']) {
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

describe('applypatch-msg', () => {
  function apply(message: string): number | null {
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

  it('refuses a patch whose message is not conventional', () => {
    expect(apply('not conventional')).not.toBe(0);
  });

  it('accepts a patch whose message is conventional', () => {
    expect(apply('feat(repo): add file')).toBe(0);
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

import { execFileSync, spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
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

describe('hook installation', () => {
  it('runs the hooks in a linked worktree before any install', () => {
    const manifest = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8')) as {
      scripts: { prepare: string };
    };
    stubPreCommit(1);
    git('add', '.husky/pre-commit');
    commit('chore: add refusing hook');
    execFileSync('sh', ['-c', manifest.scripts.prepare], {
      cwd: repo,
      env: {
        ...process.env,
        PATH: `${join(root, 'node_modules', '.bin')}:${process.env.PATH ?? ''}`,
      },
    });
    const linked = join(repo, '..', `linked-${String(Date.now())}`);
    git('worktree', 'add', '-q', linked, '-b', 'topic');
    writeFileSync(join(linked, 'file.txt'), 'content\n');
    execFileSync('git', ['add', 'file.txt'], { cwd: linked });
    const { status } = spawnSync('git', ['commit', '-q', '-m', 'feat(repo): add file'], {
      cwd: linked,
      encoding: 'utf8',
    });
    rmSync(linked, { recursive: true, force: true });
    expect(status).not.toBe(0);
  });

  it('ships every hook executable and independent of the husky helper directory', () => {
    const tracked = execFileSync('git', ['ls-files', '--stage', '--', '.husky'], {
      cwd: root,
      encoding: 'utf8',
    })
      .trim()
      .split('\n')
      .map((row) => ({ mode: row.slice(0, 6), path: row.slice(row.indexOf('\t') + 1) }));
    expect(tracked.length).toBeGreaterThan(0);
    for (const { mode, path } of tracked) {
      expect(mode, path).toBe('100755');
      expect(readFileSync(join(root, path), 'utf8'), path).not.toContain('_/');
    }
  });
});

describe('pre-commit', () => {
  it('prints no staged path that matches the scrub list', () => {
    writeFileSync(join(repo, 'CLAUDE.local.md'), '## Scrub list\n\n- `zorblax-codename`\n');
    copyFileSync(join(root, '.husky', 'pre-commit'), join(repo, '.husky', 'pre-commit'));
    const bin = join(repo, 'stub-bin');
    mkdirSync(bin);
    writeFileSync(join(bin, 'pnpm'), '#!/bin/sh\necho "pnpm $*"\nexit 1\n', { mode: 0o755 });
    git('switch', '-q', '-c', 'topic');
    writeFileSync(join(repo, 'notes-zorblax-codename.md'), 'nothing personal here\n');
    git('add', 'notes-zorblax-codename.md');
    const { status, stdout, stderr } = spawnSync('sh', ['.husky/pre-commit'], {
      cwd: repo,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH ?? ''}` },
    });
    expect(status).toBe(1);
    expect(stderr).toContain('a staged file name matches the scrub list');
    expect(stdout + stderr).not.toContain('zorblax');
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

  describe('with a named remote', () => {
    let remote = '';

    beforeEach(() => {
      remote = mkdtempSync(join(tmpdir(), 'remote-'));
      execFileSync('git', ['init', '-q', '--bare', '-b', 'main', remote]);
      git('remote', 'add', 'origin', remote);
      git('switch', '-q', '-c', 'topic');
      const token = ['ghp', 'aB3dE5gH7jK9mN1pQ3sT5vX7zA9cD1fG3hJ5'].join('_');
      writeFileSync(join(repo, 'leak.txt'), `token=${token}\n`);
      git('add', 'leak.txt');
      commit('chore: add leak');
      git('push', '-q', 'origin', 'topic');
    });

    afterEach(() => {
      rmSync(remote, { recursive: true, force: true });
    });

    function push(): number | null {
      const sha = git('rev-parse', 'HEAD');
      const { status } = spawnSync('sh', ['.husky/pre-push', 'origin', remote], {
        cwd: repo,
        input: `refs/heads/again ${sha} refs/heads/again ${NULL_SHA}\n`,
        encoding: 'utf8',
      });
      return status;
    }

    it('scans commits whose remote branch was deleted without a pruning fetch', () => {
      execFileSync('git', ['-C', remote, 'branch', '-q', '-D', 'topic']);
      expect(git('rev-parse', 'refs/remotes/origin/topic')).toBe(git('rev-parse', 'HEAD'));
      expect(push()).toBe(1);
    });

    it('skips commits the remote still holds', () => {
      expect(push()).toBe(0);
    });

    it('finishes within a second when the remote has 3,000 heads', () => {
      const heads = Array.from(
        { length: 3000 },
        (_, i) =>
          `commit refs/heads/b${String(i)}\ncommitter f <f> 1700000000 +0000\ndata ${String(String(i).length)}\n${String(i)}\n`,
      ).join('\n');
      execFileSync('git', ['fast-import', '--quiet'], { cwd: repo, input: heads });
      git('push', '-q', 'origin', 'refs/heads/b*:refs/heads/b*');
      const started = performance.now();
      const status = push();
      const elapsed = performance.now() - started;
      expect(status).toBe(0);
      expect(elapsed).toBeLessThan(1000);
    }, 30_000);

    it('scans a commit the fetch URL holds but the push target does not', () => {
      const upstream = mkdtempSync(join(tmpdir(), 'upstream-'));
      try {
        execFileSync('git', ['init', '-q', '--bare', '-b', 'main', upstream]);
        git('push', '-q', upstream, 'topic');
        execFileSync('git', ['-C', remote, 'branch', '-q', '-D', 'topic']);
        git('remote', 'set-url', 'origin', upstream);
        git('remote', 'set-url', '--push', 'origin', remote);
        expect(push()).toBe(1);
      } finally {
        rmSync(upstream, { recursive: true, force: true });
      }
    });
  });
});

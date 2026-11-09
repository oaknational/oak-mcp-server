import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const hook = join(import.meta.dirname, '../../.claude/hooks/git-guard.sh');
let clean = '';
let dirty = '';

function git(cwd: string, ...args: string[]): void {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  expect(result.status, result.stderr).toBe(0);
}

function makeRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'git-guard-'));
  git(dir, 'init', '--quiet');
  git(dir, 'config', 'user.name', 'Test');
  git(dir, 'config', 'user.email', '');
  writeFileSync(join(dir, 'file.txt'), 'one\n');
  git(dir, 'add', 'file.txt');
  git(dir, 'commit', '--quiet', '--message', 'seed');
  return dir;
}

function decide(
  cwd: string,
  tool: string,
  input: Record<string, string>,
): { status: number | null; stderr: string } {
  const { status, stderr } = spawnSync('bash', [hook], {
    input: JSON.stringify({ tool_name: tool, tool_input: input, cwd }),
    encoding: 'utf8',
  });
  return { status, stderr };
}

const bash = (cwd: string, command: string) => decide(cwd, 'Bash', { command });

beforeAll(() => {
  clean = makeRepo();
  dirty = makeRepo();
  writeFileSync(join(dirty, 'file.txt'), 'two\n');
});

afterAll(() => {
  rmSync(clean, { recursive: true, force: true });
  rmSync(dirty, { recursive: true, force: true });
});

const blockedWhenDirty = [
  'git stash',
  'git stash push -m wip',
  'git -C . stash',
  'git checkout -- file.txt',
  'git checkout HEAD -- file.txt',
  'git checkout .',
  'git restore file.txt',
  'git restore --staged file.txt',
  'git reset --hard',
  'git reset --hard HEAD',
  'cd . && git stash',
  'bash -c "git -C . stash"',
];

const allowedWhenDirty = [
  'git stash pop',
  'git stash list',
  'git reset --soft HEAD~1',
  'git checkout -b topic',
  'git checkout main',
  'git status',
  'git diff',
  'git add file.txt',
  'git commit -m "mention git stash in a message"',
  'git rebase main',
  'git push --force-with-lease=refs/heads/topic:abc123 origin topic',
  'gh stack rebase',
];

const blockedAlways = [
  'git add -A',
  'git add .',
  'git add --all',
  'git add -- .',
  'git -C . add -A',
  'git push --force origin topic',
  'git push -f origin topic',
  'git push origin topic --force',
  'git push origin +topic',
  'git push --force --force-with-lease origin topic',
  'git clean -fdx',
  'git clean -xfd',
  'git commit --no-verify -m x',
  'git commit -n -m x',
  'git commit -an -m x',
  'git push --no-verify',
  'git push -n',
  'git commit --no-pre-commit -m x',
  'git commit --no-commit-msg -m x',
  'HUSKY=0 git commit -m x',
  'SKIP_HOOKS=1 git commit -m x',
  'LEFTHOOK=0 git commit -m x',
  'env HUSKY=0 git commit -m x',
  'git -c core.hooksPath=/dev/null commit -m x',
  'git config core.hooksPath /dev/null',
  'sed -i s/a/b/ .husky/pre-commit',
  'rm .husky/pre-commit',
  'echo exit 0 > .husky/pre-commit',
  'rm -rf /',
  'rm -rf src',
  'rm -fr ~/work',
  'rm -rf ../elsewhere',
  'cat .env',
  'cat .env.local',
  'grep KEY apps/server/.env.production',
  'sh -c "git add -A"',
];

const allowedAlways = [
  'git add file.txt',
  'git add -- tools/repo-checks/git-guard.test.ts',
  'git commit -m "docs: explain why --no-verify is refused"',
  'git commit -m "fix: HUSKY=0 is refused"',
  'git commit --amend --no-edit',
  'git push --force-with-lease origin topic',
  'git push -u origin topic',
  'git rebase main',
  'git clean -n',
  'git clean -fd',
  'gh stack rebase',
  'gh stack submit --auto --open',
  'rm -rf node_modules',
  'rm -rf .cache/tmp dist coverage',
  'rm -rf /tmp/scratch-dir',
  'rm file.txt',
  'echo .env',
  'pnpm test',
];

describe('git-guard with uncommitted edits', () => {
  it.each(blockedWhenDirty)('blocks %s', (command) => {
    expect(bash(dirty, command).status).toBe(2);
  });

  it.each(allowedWhenDirty)('allows %s', (command) => {
    expect(bash(dirty, command).status).toBe(0);
  });
});

describe('git-guard on a clean tree', () => {
  it.each(blockedWhenDirty)('allows %s', (command) => {
    expect(bash(clean, command).status).toBe(0);
  });

  it.each(allowedWhenDirty)('allows %s', (command) => {
    expect(bash(clean, command).status).toBe(0);
  });
});

describe.each([
  ['with uncommitted edits', () => dirty],
  ['on a clean tree', () => clean],
])('git-guard %s', (_name, repo) => {
  it.each(blockedAlways)('blocks %s', (command) => {
    expect(bash(repo(), command).status).toBe(2);
  });

  it.each(allowedAlways)('allows %s', (command) => {
    expect(bash(repo(), command).status).toBe(0);
  });

  it.each([
    ['Read', { file_path: '/work/app/.env.local' }],
    ['Edit', { file_path: '/work/app/.env' }],
    ['Edit', { file_path: '/work/.husky/pre-commit' }],
    ['Write', { file_path: '/work/.husky/commit-msg' }],
  ])('blocks %s of %j', (tool, input) => {
    expect(decide(repo(), tool, input).status).toBe(2);
  });

  it.each([
    ['Read', { file_path: '/work/README.md' }],
    ['Edit', { file_path: '/work/AGENTS.md' }],
  ])('allows %s of %j', (tool, input) => {
    expect(decide(repo(), tool, input).status).toBe(0);
  });
});

describe('git-guard refusals', () => {
  it.each(['HUSKY=0 git commit -m x', 'git commit --no-verify -m x'])(
    'tells the agent to stop and ask the operator for %s',
    (command) => {
      const { stderr } = bash(clean, command);
      expect(stderr).toContain('stop and ask the operator');
      expect(stderr).toContain('Never try another form');
    },
  );

  it('refuses input it cannot parse', () => {
    const { status } = spawnSync('bash', [hook], { input: 'not json', encoding: 'utf8' });
    expect(status).toBe(2);
  });
});

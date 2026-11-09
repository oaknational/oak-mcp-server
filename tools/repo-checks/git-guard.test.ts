import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { REPAIR_COMMAND } from './lockfile-rebuild.ts';

const hook =
  process.env.GIT_GUARD_HOOK ?? join(import.meta.dirname, '../../.claude/hooks/git-guard.sh');
let clean = '';
let dirty = '';
let untrackedOnly = '';

function git(cwd: string, ...args: string[]): void {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  expect(result.status, result.stderr).toBe(0);
}

function makeRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'git-guard-'));
  git(dir, 'init', '--quiet', '--initial-branch=main');
  git(dir, 'config', 'user.name', 'Test');
  git(dir, 'config', 'user.email', '');
  writeFileSync(join(dir, 'file.txt'), 'one\n');
  git(dir, 'add', 'file.txt');
  git(dir, 'commit', '--quiet', '--message', 'seed');
  git(dir, 'branch', 'side');
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
  untrackedOnly = makeRepo();
  writeFileSync(join(untrackedOnly, 'scratch.txt'), 'new\n');
});

afterAll(() => {
  rmSync(clean, { recursive: true, force: true });
  rmSync(dirty, { recursive: true, force: true });
  rmSync(untrackedOnly, { recursive: true, force: true });
});

const blockedWhenDirty = [
  'git stash',
  'git stash push -m wip',
  'git -C . stash',
  'git checkout -- file.txt',
  'git checkout HEAD -- file.txt',
  'git checkout .',
  'git restore file.txt',
  'git restore --staged --worktree file.txt',
  'git restore -SW file.txt',
  'git reset --hard',
  'git reset --merge',
  'git commit -m x .',
  'git commit -m x -- .',
  'if git stash; then :; fi',
  'if true; then :; elif git stash; then :; fi',
  'while git stash; do break; done',
  'until git stash; do :; done',
  'git reset --hard HEAD',
  'git checkout file.txt',
  'git checkout HEAD file.txt',
  'git checkout HEAD .',
  'git checkout -f',
  'git checkout --force side',
  'git checkout -p file.txt',
  'git checkout -b topic -- file.txt',
  'git checkout side file.txt',
  'git switch -f side',
  'git switch --force side',
  'git switch --discard-changes side',
  'git rm -f file.txt',
  'git rm --force file.txt',
  'git rm -rf file.txt',
  'git stash -u',
  'git stash push --include-untracked',
  '\\git stash',
  'timeout 5 git stash',
  'timeout -s KILL 5 git stash',
  'xargs git stash',
  'pnpm exec git stash',
  'npx git stash',
  'cd . && git stash',
  'bash -c "git -C . stash"',
];

const allowedWhenDirty = [
  'git stash pop',
  'git stash list',
  'git restore --staged file.txt',
  'git restore -S file.txt',
  'git restore --source=HEAD --staged file.txt',
  'git commit -m . file.txt',
  'git commit -m x -- file.txt',
  'git reset --soft HEAD~1',
  'git checkout -b topic',
  'git checkout -b topic side',
  'git checkout main',
  'git checkout side',
  'git checkout -',
  'git checkout --detach HEAD',
  'git switch side',
  'git switch -c topic',
  'git rm --cached file.txt',
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
  'git add -u',
  'git add --update',
  'git add .',
  'git add ./',
  'git add :/',
  'git add *',
  'git add -Av',
  'git add -fu',
  'git commit -a -m x',
  'git commit -am x',
  'git commit --all -m x',
  '\\git add -A',
  'timeout 5 git add -A',
  'pnpm exec git add .',
  'GIT_CONFIG_PARAMETERS="\'core.hooksPath=/dev/null\'" git commit -m x',
  'GIT_CONFIG_KEY_0=core.hooksPath git commit -m x',
  'git -c alias.x=stash x',
  'git config alias.s stash',
  'mv .husky .husky-off',
  'git rm -r .husky',
  'git mv .husky/pre-commit x',
  'git checkout HEAD -- .husky',
  'rm -rf .husky',
  'head .env*',
  'cat .env.*',
  'git add --all',
  'git add ..',
  'git add -- ..',
  'git push --mirror',
  'git commit \\\n  --no-verify -m x',
  'git commit -m x \\\n  -n',
  'git add \\\n  -A',
  'git push \\\n  --force origin topic',
  'if git commit --no-verify -m x; then :; fi',
  'echo x >.husky/pre-commit',
  'echo x >> .husky/pre-commit',
  'cp x .husky/pre-commit',
  'cp -t .husky x',
  'git -c core.hooksPath=/x config --get user.name',
  'rm -rf "$TMPDIR"',
  'rm -rf "$TMPDIR/../x"',
  'rm -rf distribution',
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
  'git add -p file.txt',
  'git add apps/web/',
  'git commit --amend -m x',
  'git log -- .husky/pre-commit',
  'git diff .husky/',
  'git log --oneline .husky',
  'ls .husky',
  'cat .husky/pre-commit',
  'sed -n 1,5p .husky/pre-commit',
  'awk 1 .husky/pre-commit',
  'grep -n exit .husky/pre-commit',
  'cp .husky/pre-commit /tmp/pre-commit.copy',
  'git commit -m "see .husky/pre-commit > notes"',
  'gh pr create --title t --body "<code>.husky/pre-commit</code> runs the gate"',
  'gh pr create --body "hook path -> .husky/pre-commit"',
  'git config --get core.hooksPath',
  'git config --get-all core.hooksPath',
  'rm -rf "$TMPDIR/scratch"',
  'rm -rf "${TMPDIR}/scratch"',
  'rm -rf packages/server/dist apps/web/node_modules',
  'git add .gitignore',
  'cat .env.example',
  'head .env.sample',
  'rm -rf /private/tmp/claude-1/scratch/x',
  'timeout 5 git status',
  'pnpm exec vitest run',
  'git config --get alias.st',
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
    ['Grep', { pattern: 'SECRET', path: '.env.local' }],
    ['Grep', { pattern: 'SECRET', path: '/work/apps/.env.production' }],
    ['Grep', { pattern: 'SECRET', glob: '.env*' }],
    ['Grep', { pattern: 'SECRET', glob: '**/.env.local' }],
    ['Grep', { pattern: 'SECRET', path: '.', glob: '{.env.local,*.ts}' }],
  ])('blocks %s of %j', (tool, input) => {
    expect(decide(repo(), tool, input).status).toBe(2);
  });

  it.each([
    ['Read', { file_path: '/work/README.md' }],
    ['Read', { file_path: '/work/.env.example' }],
    ['Read', { file_path: '/work/.husky/pre-commit' }],
    ['Edit', { file_path: '/work/AGENTS.md' }],
    ['Grep', { pattern: 'export', path: 'src' }],
    ['Grep', { pattern: 'export', glob: '*.ts' }],
    ['Grep', { pattern: 'KEY', path: '/work/.env.example' }],
    ['Grep', { pattern: 'export' }],
  ])('allows %s of %j', (tool, input) => {
    expect(decide(repo(), tool, input).status).toBe(0);
  });
});

describe('git-guard with only untracked files', () => {
  it.each([
    'git stash -u',
    'git stash push --include-untracked',
    'git stash -a',
    'git clean -f',
    'git clean -fd',
    'git clean -fdq',
  ])('blocks %s', (command) => {
    expect(bash(untrackedOnly, command).status).toBe(2);
  });

  it.each([
    'git clean -n',
    'git clean -nfd',
    'git clean --dry-run',
    'git stash',
    'git status',
    'git checkout side',
  ])('allows %s', (command) => {
    expect(bash(untrackedOnly, command).status).toBe(0);
  });

  it('allows git clean -fd on a tree with no untracked files', () => {
    expect(bash(clean, 'git clean -fd').status).toBe(0);
  });

  it('refuses git clean -f in a repository named with -C', () => {
    expect(bash(clean, `git -C ${untrackedOnly} clean -f`).status).toBe(2);
  });
});

describe('git-guard with a git alias', () => {
  it('refuses an alias that expands to a refused command', () => {
    const repo = makeRepo();
    git(repo, 'config', 'alias.hide', 'stash');
    git(repo, 'config', 'alias.shell', '!git stash');
    writeFileSync(join(repo, 'file.txt'), 'edited\n');
    expect(bash(repo, 'git hide').status).toBe(2);
    expect(bash(repo, 'git shell').status).toBe(2);
    rmSync(repo, { recursive: true, force: true });
  });
});

describe('git-guard with an alias that takes arguments', () => {
  let repo = '';

  beforeAll(() => {
    repo = makeRepo();
    git(repo, 'config', 'alias.co', 'checkout');
    git(repo, 'config', 'alias.sh', '!git checkout');
    writeFileSync(join(repo, 'file.txt'), 'edited\n');
  });

  afterAll(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it.each(['git co file.txt', 'git co -- file.txt', 'git co HEAD .', 'git sh file.txt'])(
    'refuses %s while the tree is dirty',
    (command) => {
      expect(bash(repo, command).status).toBe(2);
    },
  );

  it.each(['git co side', 'git sh side', 'git co -b topic'])('allows %s', (command) => {
    expect(bash(repo, command).status).toBe(0);
  });

  it('names the restore alternative when it refuses git restore', () => {
    const { stderr } = bash(repo, 'git restore file.txt');
    expect(stderr).toContain('git restore --staged');
    expect(stderr).not.toContain('Commit them first');
  });
});

describe('git-guard malformed payloads', () => {
  it.each([
    'null',
    '[]',
    '42',
    '"text"',
    '{}',
    '{"tool_name":"Bash","tool_input":null}x',
    '{"tool_name":"Bash","tool_input":[]}',
  ])('refuses %s with exit 2', (input) => {
    const { status, stderr } = spawnSync('bash', [hook], { input, encoding: 'utf8' });
    expect(status).toBe(2);
    expect(stderr).toContain('git-guard refused');
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

describe('git-guard review fixes', () => {
  it.each([
    'git commit -am"fix: a b"',
    'git commit -nm"fix: a b"',
    'echo x>.husky/pre-commit',
    'cat x>>.husky/pre-commit',
    'cat<.env',
    'cat .envrc',
    'cat .env-prod',
  ])('refuses %s', (command) => {
    expect(bash(clean, command).status).toBe(2);
  });

  it.each([
    ['Read', { file_path: '/work/.envrc' }],
    ['Grep', { pattern: 'SECRET', path: '/work/.env-prod' }],
  ] as const)('refuses %s on an env-like file', (tool, input) => {
    expect(decide(clean, tool, { ...input }).status).toBe(2);
  });

  it.each(['git commit -m"fix a b"', 'cat .env.example'])('allows %s', (command) => {
    expect(bash(clean, command).status).toBe(0);
  });

  it('counts untracked files when status.showUntrackedFiles is no', () => {
    const repo = makeRepo();
    try {
      writeFileSync(join(repo, 'scratch.txt'), 'new\n');
      git(repo, 'config', 'status.showUntrackedFiles', 'no');
      expect(bash(repo, 'git clean -f').status).toBe(2);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('checks a stash against the directory a literal cd moves into', () => {
    const parent = makeRepo();
    try {
      const inner = join(parent, 'inner');
      mkdirSync(inner);
      git(inner, 'init', '--quiet', '--initial-branch=main');
      git(inner, 'config', 'user.name', 'Test');
      git(inner, 'config', 'user.email', '');
      writeFileSync(join(inner, 'f.txt'), 'one\n');
      git(inner, 'add', 'f.txt');
      git(inner, 'commit', '--quiet', '--message', 'seed');
      writeFileSync(join(inner, 'f.txt'), 'two\n');
      expect(bash(parent, 'cd inner && git stash').status).toBe(2);
      expect(bash(parent, 'cd "$SOMEWHERE" && git stash').status).toBe(2);
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  it('allows the lockfile repair command', () => {
    expect(bash(clean, REPAIR_COMMAND).status).toBe(0);
  });
});

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const SERVED = 'apps/server/served-surface.json';
const BASELINE = 'tools/surface-diff/baseline.json';

function fixtureRepo(prefix: string) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  const git = (...args: string[]): string => {
    const result = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
    if (result.status !== 0) {
      throw new Error(result.stderr);
    }
    return result.stdout.trim();
  };
  const put = (path: string, content: string): void => {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), content);
  };
  const copy = (path: string): void => {
    put(path, readFileSync(join(import.meta.dirname, '../..', path), 'utf8'));
  };
  const editTools = (
    path: string,
    edit: (tools: Record<string, Record<string, unknown>>) => void,
  ): void => {
    const file = JSON.parse(readFileSync(join(dir, path), 'utf8')) as {
      surface: { tools: Record<string, Record<string, unknown>> };
    };
    edit(file.surface.tools);
    put(path, JSON.stringify(file, null, 2));
  };
  const commit = (message: string): string => {
    git('add', '-A');
    git('-c', 'user.name=t', '-c', 'user.email=fixture', 'commit', '-q', '-m', message);
    return git('rev-parse', 'HEAD');
  };
  const run = (script: string, env: Record<string, string>) => {
    const result = spawnSync('node', [join(import.meta.dirname, script)], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, GITHUB_STEP_SUMMARY: '', PR_BODY: '', ...env },
    });
    return { status: result.status, output: result.stdout + result.stderr };
  };
  return { git, put, copy, editTools, commit, run };
}

describe('pr-size and version-check on a branch behind its base', () => {
  const { git, put, copy, editTools, commit, run } = fixtureRepo('merge-base-');

  const addTool = (name: string): void => {
    editTools(SERVED, (tools) => {
      const [first] = Object.values(tools);
      tools[name] = { ...first, name };
    });
  };
  const chore = { PR_TITLE: 'MCP-1: chore(tools): tidy' };

  git('init', '-q', '-b', 'main');
  copy(SERVED);
  put('README.md', 'start');
  commit('start');
  git('checkout', '-q', '-b', 'branch');
  put('tools/own.ts', 'own');
  commit('branch work');
  git('checkout', '-q', 'main');
  put('apps/server/src/newer.ts', 'newer');
  addTool('zz-main-tool');
  const base = commit('main moves on and adds a tool');
  git('checkout', '-q', 'branch');

  it('pr-size counts only the branch’s own files', () => {
    const result = run('pr-size.ts', { BASE_SHA: base });
    expect(result.output).toContain('1 authored files');
  });

  it('version-check judges only the branch’s own files and served tools', () => {
    const result = run('version-rules.ts', { BASE_SHA: base, ...chore });
    expect(result.output).toContain('version-check: ok');
    expect(result.status).toBe(0);
  });

  it('both still judge only the branch’s own files after it merges main in', () => {
    git('-c', 'user.name=t', '-c', 'user.email=fixture', 'merge', '-q', '--no-edit', 'main');
    put('tools/own2.ts', 'own2');
    commit('more branch work');
    git('checkout', '-q', 'main');
    put('apps/server/src/later.ts', 'later');
    addTool('zz-later-tool');
    const later = commit('main moves on again');
    git('checkout', '-q', 'branch');
    expect(run('pr-size.ts', { BASE_SHA: later }).output).toContain('2 authored files');
    const version = run('version-rules.ts', { BASE_SHA: later, ...chore });
    expect(version.output).toContain('version-check: ok');
    expect(version.status).toBe(0);
  });

  it.each(['', 'deadbeef'.repeat(5), 'nonsense'])('both fail on an unreachable base %j', (bad) => {
    expect(run('pr-size.ts', { BASE_SHA: bad }).status).toBe(1);
    expect(run('version-rules.ts', { BASE_SHA: bad, ...chore }).status).toBe(1);
  });

  it('version-check still refuses a chore when the branch’s own files are runtime code', () => {
    put('apps/server/src/own.ts', 'own');
    commit('branch runtime work');
    const result = run('version-rules.ts', { BASE_SHA: base, ...chore });
    expect(result.output).toContain('apps/server/src/own.ts');
    expect(result.output).not.toContain('newer.ts');
    expect(result.status).toBe(1);
  });
});

describe('version-check on the committed served surface', () => {
  const { git, put, copy, editTools, commit, run } = fixtureRepo('served-surface-');
  const versionCheck = (base: string, title: string) =>
    run('version-rules.ts', { BASE_SHA: base, PR_TITLE: title });
  const dropFirstTool = (tools: Record<string, Record<string, unknown>>): void => {
    const [first = ''] = Object.keys(tools);
    Reflect.deleteProperty(tools, first);
  };

  git('init', '-q', '-b', 'main');
  put('README.md', 'before the served surface');
  const bare = commit('before the served surface');
  copy(SERVED);
  copy(BASELINE);
  const base = commit('start');

  it('holds a served tool removal to the rules even when the OOCE baseline is untouched', () => {
    git('checkout', '-q', '-b', 'remove-tool', base);
    editTools(SERVED, dropFirstTool);
    commit('drop a served tool');
    const chore = versionCheck(base, 'MCP-1: chore(tools): tidy');
    expect(chore.output).toContain('must release');
    expect(chore.status).toBe(1);
    expect(versionCheck(base, 'MCP-1: feat(tools): drop').output).toContain('## Breaking change');
  });

  it('passes a re-snapshot of the OOCE baseline alone under chore', () => {
    git('checkout', '-q', '-b', 'resnapshot', base);
    editTools(BASELINE, dropFirstTool);
    commit('re-snapshot the baseline');
    const result = versionCheck(base, 'MCP-1: chore(surface-diff): re-snapshot');
    expect(result.output).toContain('version-check: ok');
    expect(result.status).toBe(0);
  });

  it('fails and names the file when the base has no served surface', () => {
    git('checkout', '-q', base);
    const result = versionCheck(bare, 'MCP-1: chore: x');
    expect(result.output).toContain(SERVED);
    expect(result.status).toBe(1);
  });
});

describe('the pr-size and version-check jobs', () => {
  const workflow = parse(
    readFileSync(join(import.meta.dirname, '../../.github/workflows/ci.yml'), 'utf8'),
  ) as { jobs: Record<string, { steps: { uses?: string; with?: Record<string, unknown> }[] }> };

  it.each(['pr-size', 'version-check'])(
    '%s checks out the PR head, not a merge ref built on a newer base',
    (job) => {
      const checkout = workflow.jobs[job]?.steps.find((step) =>
        step.uses?.startsWith('actions/checkout@'),
      );
      expect(checkout?.with).toMatchObject({
        ref: '${{ github.event.pull_request.head.sha }}',
        'fetch-depth': 0,
      });
    },
  );
});

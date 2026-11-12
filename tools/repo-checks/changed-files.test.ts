import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const BASELINE = 'tools/surface-diff/baseline.json';

describe('pr-size and version-check on a branch behind its base', () => {
  const dir = mkdtempSync(join(tmpdir(), 'merge-base-'));
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

  git('init', '-q', '-b', 'main');
  mkdirSync(join(dir, dirname(BASELINE)), { recursive: true });
  copyFileSync(join(import.meta.dirname, '../..', BASELINE), join(dir, BASELINE));
  put('README.md', 'start');
  commit('start');
  git('checkout', '-q', '-b', 'branch');
  put('tools/own.ts', 'own');
  commit('branch work');
  git('checkout', '-q', 'main');
  put('apps/server/src/newer.ts', 'newer');
  const base = commit('main moves on');
  git('checkout', '-q', 'branch');

  it('pr-size counts only the branch’s own files', () => {
    const result = run('pr-size.ts', { BASE_SHA: base });
    expect(result.output).toContain('1 authored files');
  });

  it('version-check judges only the branch’s own files', () => {
    const result = run('version-rules.ts', {
      BASE_SHA: base,
      PR_TITLE: 'MCP-1: chore(tools): tidy',
    });
    expect(result.output).toContain('version-check: ok');
    expect(result.status).toBe(0);
  });

  it('version-check still refuses a chore when the branch’s own files are runtime code', () => {
    put('apps/server/src/own.ts', 'own');
    commit('branch runtime work');
    const result = run('version-rules.ts', {
      BASE_SHA: base,
      PR_TITLE: 'MCP-1: chore(tools): tidy',
    });
    expect(result.output).toContain('apps/server/src/own.ts');
    expect(result.output).not.toContain('newer.ts');
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

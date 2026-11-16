import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { EXPECTED_SOURCE, checkAgainstUpstream } from './skills-upstream-check.ts';

const GIT_IDENTITY = ['-c', 'user.name=t', '-c', 'user.email=fixture'];

function git(cwd: string, args: string[]): string {
  const result = spawnSync('git', [...GIT_IDENTITY, ...args], { cwd, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
  }
  return result.stdout;
}

let upstream = '';
let root = '';

beforeEach(() => {
  upstream = mkdtempSync(join(tmpdir(), 'skills-upstream-source-'));
  git(upstream, ['init', '--quiet']);
  mkdirSync(join(upstream, 'skills/central/oak-tdd'), { recursive: true });
  writeFileSync(join(upstream, 'skills/central/oak-tdd/SKILL.md'), 'skill body\n');
  writeFileSync(join(upstream, 'skills/central/oak-tdd/reference.md'), 'reference body\n');
  git(upstream, ['add', 'skills/central/oak-tdd/SKILL.md', 'skills/central/oak-tdd/reference.md']);
  git(upstream, ['commit', '--quiet', '-m', 'seed']);

  root = mkdtempSync(join(tmpdir(), 'skills-upstream-root-'));
  for (const base of ['.agents/skills/oak-tdd', '.claude/skills/oak-tdd']) {
    mkdirSync(join(root, base), { recursive: true });
    writeFileSync(join(root, base, 'SKILL.md'), 'skill body\n');
    writeFileSync(join(root, base, 'reference.md'), 'reference body\n');
  }
});

afterEach(() => {
  rmSync(upstream, { recursive: true, force: true });
  rmSync(root, { recursive: true, force: true });
});

function commit(): string {
  return git(upstream, ['rev-parse', 'HEAD']).trim();
}

describe('checkAgainstUpstream', () => {
  it('passes when every vendored file and its .claude/skills mirror match upstream', () => {
    const problems = checkAgainstUpstream(
      root,
      { source: upstream, commit: commit(), skills: ['oak-tdd'] },
      upstream,
    );
    expect(problems).toEqual([]);
  });

  it('fails on an edited file even when the manifest hash is rewritten to match it', () => {
    writeFileSync(join(root, '.agents/skills/oak-tdd/SKILL.md'), 'edited content\n');
    const problems = checkAgainstUpstream(
      root,
      { source: upstream, commit: commit(), skills: ['oak-tdd'] },
      upstream,
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('.agents/skills/oak-tdd/SKILL.md: differs from');
    expect(problems[0]).toContain("whatever oak-skills.json's recorded hash says");
  });

  it('fails on an edited .claude/skills mirror even when only that file changes', () => {
    writeFileSync(join(root, '.claude/skills/oak-tdd/SKILL.md'), 'edited mirror content\n');
    const problems = checkAgainstUpstream(
      root,
      { source: upstream, commit: commit(), skills: ['oak-tdd'] },
      upstream,
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('.claude/skills/oak-tdd/SKILL.md: differs from');
  });

  it('fails and names a file missing locally', () => {
    rmSync(join(root, '.agents/skills/oak-tdd/SKILL.md'));
    const problems = checkAgainstUpstream(
      root,
      { source: upstream, commit: commit(), skills: ['oak-tdd'] },
      upstream,
    );
    expect(problems).toContain(
      '.agents/skills/oak-tdd/SKILL.md: missing, cannot compare it against upstream',
    );
  });

  it('fails on a vendored file deleted from both mirrors, even with its manifest entry also removed', () => {
    // Simulates a PR that deletes a vendored file and drops its line from
    // oak-skills.json's "files" map, so the check must not rely on that map
    // to know which files should exist: it must ask the real upstream tree.
    rmSync(join(root, '.agents/skills/oak-tdd/reference.md'));
    rmSync(join(root, '.claude/skills/oak-tdd/reference.md'));
    const problems = checkAgainstUpstream(
      root,
      { source: upstream, commit: commit(), skills: ['oak-tdd'] },
      upstream,
    );
    expect(problems).toContain(
      '.agents/skills/oak-tdd/reference.md: missing, cannot compare it against upstream',
    );
    expect(problems).toContain(
      '.claude/skills/oak-tdd/reference.md: missing, cannot compare it against upstream',
    );
  });

  it('fails on an extra file added to both mirrors, even with a matching manifest entry', () => {
    // Simulates a PR that adds a file not present upstream and adds a
    // matching hash for it to oak-skills.json's "files" map, so the check
    // must not stop at the upstream file list alone: it must also look for
    // local files that upstream does not have.
    writeFileSync(join(root, '.agents/skills/oak-tdd/extra.md'), 'not upstream\n');
    writeFileSync(join(root, '.claude/skills/oak-tdd/extra.md'), 'not upstream\n');
    const problems = checkAgainstUpstream(
      root,
      { source: upstream, commit: commit(), skills: ['oak-tdd'] },
      upstream,
    );
    expect(problems).toContain(
      `.agents/skills/oak-tdd/extra.md: not vendored from ${upstream}@${commit()}, remove it or add it upstream and re-pin`,
    );
    expect(problems).toContain(
      `.claude/skills/oak-tdd/extra.md: not vendored from ${upstream}@${commit()}, remove it or add it upstream and re-pin`,
    );
  });

  it('fails and names a skill missing upstream', () => {
    mkdirSync(join(root, '.agents/skills/oak-ticket-start'), { recursive: true });
    writeFileSync(join(root, '.agents/skills/oak-ticket-start/SKILL.md'), 'not upstream\n');
    const problems = checkAgainstUpstream(
      root,
      { source: upstream, commit: commit(), skills: ['oak-ticket-start'] },
      upstream,
    );
    expect(problems).toEqual([
      `oak-ticket-start: not found at skills/central/oak-ticket-start in ${upstream}@${commit()}`,
    ]);
  });

  it('rejects a commit that is not a full 40-character SHA', () => {
    const problems = checkAgainstUpstream(
      root,
      { source: upstream, commit: 'main', skills: [] },
      upstream,
    );
    expect(problems).toEqual([
      'oak-skills.json: "commit" must be a full 40-character SHA, got \'main\'',
    ]);
  });

  it('fails when the source cannot be fetched', () => {
    const noSuchSource = join(tmpdir(), 'no-such-oak-agent-skills-repo');
    const problems = checkAgainstUpstream(
      root,
      { source: noSuchSource, commit: commit(), skills: [] },
      noSuchSource,
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('could not fetch');
  });

  it('refuses a pinned source other than the real oak-agent-skills repository', () => {
    const problems = checkAgainstUpstream(root, {
      source: upstream,
      commit: commit(),
      skills: [],
    });
    expect(problems).toEqual([
      `oak-skills.json: "source" must be '${EXPECTED_SOURCE}', got '${upstream}'`,
    ]);
  });

  it('defaults to requiring the real oak-agent-skills repository as the source', () => {
    expect(EXPECTED_SOURCE).toBe('https://github.com/oaknational/oak-agent-skills');
  });
});

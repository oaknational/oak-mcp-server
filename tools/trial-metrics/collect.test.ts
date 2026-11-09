import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { collect, format, type GraphQl } from './collect.ts';

const PLACEHOLDER = '0000000000000000000000000000000000000001';
const REPO = 'example-org/example-repo';
const NOW = new Date('2026-10-30T00:00:00Z');

const alwaysOn = {
  'CLAUDE.md': '@AGENTS.md\n',
  'AGENTS.md': '# Agents\n\nRead @docs/extra.md before a café break 🍎.\n',
  'docs/extra.md': 'Extra guidance.\n',
  '.claude/rules/always.md': 'Always apply this rule.\n',
};
const onDemand = {
  'docs/unreferenced.md': 'Never loaded at session start.\n',
  '.claude/rules/scoped.md': '---\npaths: src/**\n---\nOnly for files under src.\n',
  '.claude/skills/tdd/SKILL.md': '---\nname: tdd\n---\nWrite the failing test first.\n',
  'README.md': 'Readme text.\n',
};

let checkout: string;
let commit: string;

function git(args: string[]): string {
  return execFileSync('git', ['-C', checkout, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Fixture',
      GIT_AUTHOR_EMAIL: 'fixture',
      GIT_COMMITTER_NAME: 'Fixture',
      GIT_COMMITTER_EMAIL: 'fixture',
    },
  }).trim();
}

beforeAll(() => {
  checkout = mkdtempSync(join(tmpdir(), 'trial-metrics-'));
  git(['init', '--quiet']);
  for (const [path, text] of Object.entries({ ...alwaysOn, ...onDemand })) {
    mkdirSync(dirname(join(checkout, path)), { recursive: true });
    writeFileSync(join(checkout, path), text);
    git(['add', '--', path]);
  }
  commit = git(['commit-tree', git(['write-tree']), '-m', 'fixture tree']);
});

afterAll(() => {
  rmSync(checkout, { recursive: true, force: true });
});

function recorded(): { graphql: GraphQl; queries: string[] } {
  const pages = ['search-page-1.json', 'search-page-2.json'].map(
    (name) =>
      JSON.parse(
        readFileSync(join(import.meta.dirname, 'fixtures', name), 'utf8').replaceAll(
          PLACEHOLDER,
          commit,
        ),
      ) as unknown,
  );
  const queries: string[] = [];
  const graphql: GraphQl = (_query, variables) => {
    queries.push(String(variables.q));
    return pages[variables.after === null ? 0 : 1];
  };
  return { graphql, queries };
}

function run(until?: string) {
  const { graphql, queries } = recorded();
  const result = collect({ repo: REPO, since: '2026-10-01', until, checkout, now: NOW, graphql });
  const byNumber = new Map(result.rows.map((row) => [row.pr.number, row]));
  return { ...result, byNumber, queries };
}

describe('trial-metrics collect', () => {
  it('marks a PR reverted inside 7 days as a change failure', () => {
    expect(run().byNumber.get(101)?.changeFailure).toEqual({ kind: 'revert', by: 102 });
  });

  it('does not count a revert on day 8', () => {
    expect(run().byNumber.get(103)?.changeFailure).toEqual({ kind: 'none' });
  });

  it('marks a PR fixed by a hotfix inside 7 days as a change failure', () => {
    expect(run().byNumber.get(105)?.changeFailure).toEqual({ kind: 'hotfix', by: 106 });
  });

  it('leaves a PR pending until its 7 days have passed', () => {
    expect(run().byNumber.get(107)?.changeFailure).toEqual({ kind: 'pending' });
  });

  it('flags the agent-correction label and only that label', () => {
    const { byNumber } = run();
    expect(byNumber.get(105)?.agentCorrection).toBe(true);
    expect(byNumber.get(107)?.agentCorrection).toBe(false);
    expect(byNumber.get(101)?.agentCorrection).toBe(false);
  });

  it('measures open to merge in hours', () => {
    expect(run().byNumber.get(105)?.openToMergeHours).toBe(48);
  });

  it('counts guidance tokens as the always-on characters divided by 4', () => {
    const chars = Object.values(alwaysOn).reduce((sum, text) => sum + Array.from(text).length, 0);
    const { rows } = run();
    expect(rows.map((row) => row.guidanceTokens)).toEqual(rows.map(() => Math.floor(chars / 4)));
  });

  it('reads every page and counts each API call', () => {
    const { rows, apiCalls } = run();
    expect(rows.map((row) => row.pr.number)).toEqual([101, 102, 103, 105, 106, 104, 107]);
    expect(apiCalls).toBe(2);
  });

  it('reports only PRs merged inside --until but still sees later fixes', () => {
    const { rows, byNumber, queries } = run('2026-10-10');
    expect(rows.map((row) => row.pr.number)).toEqual([101, 102, 103, 105]);
    expect(byNumber.get(105)?.changeFailure).toEqual({ kind: 'hotfix', by: 106 });
    expect(queries[0]).toBe(`repo:${REPO} is:pr is:merged merged:2026-10-01..2026-10-17`);
  });

  it('prints the four metric columns and the rates', () => {
    const table = format(run().rows);
    expect(table).toContain(
      '| PR | merged | change failure | agent correction | open to merge (h) | guidance tokens |',
    );
    expect(table).toContain('change-failure rate: 2/6 (33.3%), 1 pending');
    expect(table).toContain('agent-correction rate: 1/7 (14.3%)');
  });

  it('names the missing commit when the checkout lacks it', () => {
    const { graphql } = recorded();
    const missing: GraphQl = (query, variables) =>
      JSON.parse(
        JSON.stringify(graphql(query, variables)).replaceAll(commit, 'f'.repeat(40)),
      ) as unknown;
    expect(() =>
      collect({ repo: REPO, since: '2026-10-01', checkout, now: NOW, graphql: missing }),
    ).toThrow(`commit ${'f'.repeat(40)} is not in ${checkout}`);
  });
});

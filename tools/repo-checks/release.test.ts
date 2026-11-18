import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { analyzeCommits } from '@semantic-release/commit-analyzer';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import releaseConfig from '../../release.config.mjs';
import { findMajorReleases, RELEASE_RULES, releaseFor } from './release.ts';
import { RELEASE_BY_TYPE } from './version-rules.ts';

describe('release rules', () => {
  it('let no commit type or footer produce a major release', () => {
    expect(findMajorReleases(RELEASE_RULES)).toEqual([]);
  });

  it.each(Object.entries(RELEASE_BY_TYPE))('release %s as version-rules says', (type, release) => {
    expect(releaseFor(RELEASE_RULES, { type, breaking: false, revert: false })).toBe(release);
  });

  it('keep a breaking feat at a minor release', () => {
    expect(releaseFor(RELEASE_RULES, { type: 'feat', breaking: true, revert: false })).toBe(
      'minor',
    );
  });

  it('fail a config that maps breaking commits to major', () => {
    expect(findMajorReleases([...RELEASE_RULES, { breaking: true, release: 'major' }])).toContain(
      'feat!',
    );
  });

  it('fail a config that leaves a breaking commit to the default rules', () => {
    const majors = findMajorReleases([
      { type: 'feat', release: 'minor' },
      { type: 'fix', release: 'patch' },
    ]);
    expect(majors).toContain('refactor!');
    expect(majors).toContain('(no type)!');
    expect(majors).not.toContain('feat!');
  });

  it('fail a config where a later rule overrides the breaking guard', () => {
    expect(
      findMajorReleases([
        { breaking: true, release: false },
        { type: 'perf', breaking: true, release: 'premajor' },
      ]),
    ).toEqual(['perf!', '(revert) perf!']);
  });

  it('fail a major rule that a later no-release rule follows, since major ends the analysis', () => {
    expect(
      findMajorReleases([
        { type: 'docs', breaking: true, release: 'major' },
        { breaking: true, release: false },
      ]),
    ).toEqual(['docs!', '(revert) docs!']);
  });

  it('fail a config that maps a typed revert to major', () => {
    expect(
      findMajorReleases([...RELEASE_RULES, { type: 'revert', revert: true, release: 'major' }]),
    ).toEqual(['(revert) revert', '(revert) revert!']);
  });

  it('refuse a rule it cannot model', () => {
    expect(() => findMajorReleases([{ type: 'fe*', release: 'minor' }])).toThrow('glob');
    expect(() => findMajorReleases([{ scope: 'server', release: 'minor' }])).toThrow('scope');
    expect(() => findMajorReleases([{ type: 'feat', release: 'huge' }])).toThrow('huge');
  });
});

async function releaseOf(...messages: string[]): Promise<string | null> {
  return analyzeCommits(releaseConfig, {
    commits: messages.map((message, index) => ({ message, hash: String(index) })),
    logger: { log: () => undefined },
    cwd: process.cwd(),
  });
}

describe('semantic-release config', () => {
  it('takes its release rules from the release check, so the check covers what ships', () => {
    expect(releaseConfig.releaseRules).toBe(RELEASE_RULES);
    expect(findMajorReleases(releaseConfig.releaseRules)).toEqual([]);
  });

  it('parses a header behind a Linear id, as commitlint does', async () => {
    expect(await releaseOf('MCP-812: feat(server): add tool')).toBe('minor');
    expect(await releaseOf('MCP-812: fix(server): handle a timeout (#12)')).toBe('patch');
    expect(await releaseOf('MCP-812: chore(repo): tidy')).toBeNull();
  });

  it('never cuts a major release, whatever the header or footer says', async () => {
    expect(await releaseOf('MCP-1: feat(server)!: drop a tool')).toBe('minor');
    expect(await releaseOf('MCP-1: fix(server): x\n\nBREAKING CHANGE: the tool moved')).toBe(
      'patch',
    );
    expect(await releaseOf('MCP-1: chore(repo): x\n\nBREAKING CHANGE: y')).toBeNull();
  });

  it('never releases its own version commit', async () => {
    expect(await releaseOf('chore(release): 1.2.3 [skip ci]')).toBeNull();
  });
});

interface Job {
  if?: string;
  needs?: string | string[];
  permissions?: Record<string, string>;
  steps?: { uses?: string; run?: string; with?: Record<string, string> }[];
}

const workflow = parse(
  readFileSync(join(import.meta.dirname, '../../.github/workflows/release.yml'), 'utf8'),
) as { on: Record<string, { branches?: string[] }>; jobs: Record<string, Job> };
const jobs = Object.entries(workflow.jobs);
const runs = (job: Job): string => (job.steps ?? []).map((step) => step.run ?? '').join('\n');
const usesSecrets = (job: Job): boolean => JSON.stringify(job).includes('secrets.');

describe('release workflow', () => {
  it('runs only on a push to main', () => {
    expect(workflow.on).toEqual({ push: { branches: ['main'] } });
  });

  it('runs semantic-release only after the merged pull request passed ci-gate', () => {
    const gate = workflow.jobs['ci-gate-passed'];
    expect(runs(gate ?? {})).toContain('check_name=ci-gate');
    for (const [name, job] of jobs.filter(([, job]) => runs(job).includes('semantic-release'))) {
      expect(job.needs, name).toBe('ci-gate-passed');
    }
  });

  it('publishes only when the RELEASE_ENABLED repository variable is true', () => {
    const publishing = jobs.filter(
      ([, job]) => runs(job).includes('semantic-release') && !runs(job).includes('--dry-run'),
    );
    expect(publishing.map(([name]) => name)).toEqual(['release']);
    expect(workflow.jobs['release']?.if).toBe("vars.RELEASE_ENABLED == 'true'");
  });

  it('does a dry run with a read-only token and no secrets while the switch is off', () => {
    const dryRun = workflow.jobs['dry-run'];
    expect(dryRun?.if).toBe("vars.RELEASE_ENABLED != 'true'");
    expect(runs(dryRun ?? {})).toContain('semantic-release --dry-run');
    expect(dryRun?.permissions).toEqual({ contents: 'read' });
    expect(usesSecrets(dryRun ?? {})).toBe(false);
  });

  it('reads secrets only in the release job', () => {
    expect(jobs.filter(([, job]) => usesSecrets(job)).map(([name]) => name)).toEqual(['release']);
  });
});

const conformance = parse(
  readFileSync(join(import.meta.dirname, '../../.github/workflows/conformance.yml'), 'utf8'),
) as { on: Record<string, unknown>; jobs: Record<string, Job> };
const conformanceText = readFileSync(
  join(import.meta.dirname, '../../.github/workflows/conformance.yml'),
  'utf8',
);

describe('production conformance workflow', () => {
  it('runs only by manual dispatch, so no fork or schedule reaches production', () => {
    expect(Object.keys(conformance.on)).toEqual(['workflow_dispatch']);
  });

  it('reads no secrets, so its logs and reports cannot hold a production token', () => {
    expect(conformanceText).not.toContain('secrets.');
  });

  it('passes the target to shell steps only through the environment', () => {
    for (const job of Object.values(conformance.jobs)) {
      for (const step of job.steps ?? []) {
        expect(step.run ?? '').not.toContain('${{');
      }
    }
  });
});

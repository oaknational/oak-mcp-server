import commitlintConventional from '@commitlint/config-conventional';

import { RELEASE_BY_TYPE } from './version-rules.ts';

const RELEASES = [
  'major',
  'premajor',
  'minor',
  'preminor',
  'patch',
  'prepatch',
  'prerelease',
] as const;
type Release = (typeof RELEASES)[number];
type RuleRelease = Release | false | null;

interface ReleaseRule {
  readonly type?: string | undefined;
  readonly breaking?: boolean | undefined;
  readonly revert?: boolean | undefined;
  readonly release: RuleRelease;
}

interface Commit {
  readonly type: string | undefined;
  readonly breaking: boolean;
  readonly revert: boolean;
}

export const RELEASE_RULES: readonly ReleaseRule[] = [
  { breaking: true, release: false },
  ...Object.entries(RELEASE_BY_TYPE).map(([type, release]) => ({ type, release })),
];

// The conventional-commit rules in @semantic-release/commit-analyzer 13.0.1's
// lib/default-release-rules.js, which it applies when no custom rule matches.
const DEFAULT_RULES: readonly ReleaseRule[] = [
  { breaking: true, release: 'major' },
  { revert: true, release: 'patch' },
  { type: 'feat', release: 'minor' },
  { type: 'fix', release: 'patch' },
  { type: 'perf', release: 'patch' },
  { type: 'FEAT', release: 'minor' },
  { type: 'FIX', release: 'patch' },
];

const MAJOR: ReadonlySet<RuleRelease> = new Set(['major', 'premajor']);
const RULE_KEYS = new Set(['type', 'breaking', 'revert', 'release']);
const GLOB = /[*?[\]{}()!+@|\\]/;

function rank(release: RuleRelease): number {
  return release === false || release === null ? -1 : RELEASES.indexOf(release);
}

function matches(rule: ReleaseRule, commit: Commit): boolean {
  return (
    (rule.breaking !== true || commit.breaking) &&
    (rule.revert !== true || commit.revert) &&
    (rule.type === undefined || rule.type === commit.type)
  );
}

function highest(rules: readonly ReleaseRule[], commit: Commit): RuleRelease | undefined {
  let result: RuleRelease | undefined;
  for (const rule of rules.filter((r) => matches(r, commit))) {
    if (!result || rank(rule.release) < rank(result)) {
      result = rule.release;
    }
    if (result === 'major') {
      break;
    }
  }
  return result;
}

export function releaseFor(rules: readonly ReleaseRule[], commit: Commit): RuleRelease | undefined {
  const custom = highest(rules, commit);
  return custom === undefined ? highest(DEFAULT_RULES, commit) : custom;
}

function isRelease(value: unknown): value is RuleRelease {
  return value === false || value === null || RELEASES.some((release) => release === value);
}

function parseRule(raw: unknown): ReleaseRule {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error(`release rule ${JSON.stringify(raw)} is not an object`);
  }
  const entries = Object.entries(raw);
  const unknownKey = entries.find(([key]) => !RULE_KEYS.has(key));
  if (unknownKey !== undefined) {
    throw new Error(`release rule key '${unknownKey[0]}' is not modelled by this check`);
  }
  const fields = new Map<string, unknown>(entries);
  const type = fields.get('type');
  if (type !== undefined && (typeof type !== 'string' || GLOB.test(type))) {
    throw new Error(`release rule type ${JSON.stringify(type)} must be a plain name, not a glob`);
  }
  const release = fields.get('release');
  if (!isRelease(release)) {
    throw new Error(`release rule release ${JSON.stringify(release)} is not a release type`);
  }
  return { type, breaking: flag(fields, 'breaking'), revert: flag(fields, 'revert'), release };
}

function flag(fields: ReadonlyMap<string, unknown>, key: string): boolean | undefined {
  const value = fields.get(key);
  if (value !== undefined && typeof value !== 'boolean') {
    throw new Error(`release rule ${key} must be a boolean`);
  }
  return value;
}

function commitsToCheck(rules: readonly ReleaseRule[]): Commit[] {
  const types = new Set([
    ...commitlintConventional.rules['type-enum'][2],
    ...rules.flatMap((rule) => (rule.type === undefined ? [] : [rule.type])),
  ]);
  return [...types, undefined].flatMap((type) =>
    [false, true].flatMap((revert) =>
      [false, true].map((breaking) => ({ type, revert, breaking })),
    ),
  );
}

function describe({ type, breaking, revert }: Commit): string {
  return `${revert ? '(revert) ' : ''}${type ?? '(no type)'}${breaking ? '!' : ''}`;
}

export function findMajorReleases(rawRules: readonly unknown[]): string[] {
  const rules = rawRules.map(parseRule);
  return commitsToCheck(rules)
    .filter((commit) => MAJOR.has(releaseFor(rules, commit) ?? null))
    .map(describe);
}

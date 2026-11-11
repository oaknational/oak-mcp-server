import { execFileSync } from 'node:child_process';
import { posix } from 'node:path';
import { parseArgs } from 'node:util';

export type GraphQl = (query: string, variables: Record<string, string | null>) => unknown;

interface MergedPr {
  number: number;
  title: string;
  body: string;
  headRefName: string;
  labels: string[];
  createdAt: Date;
  mergedAt: Date;
  mergeCommit: string;
}

type ChangeFailure =
  { kind: 'none' } | { kind: 'pending' } | { kind: 'revert' | 'hotfix'; by: number };

interface Row {
  pr: MergedPr;
  changeFailure: ChangeFailure;
  agentCorrection: boolean;
  openToMergeHours: number;
  guidanceTokens: number;
}

interface Options {
  repo: string;
  since: string;
  until?: string | undefined;
  path?: string | undefined;
  checkout: string;
  now: Date;
  graphql: GraphQl;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const FAILURE_WINDOW_MS = 7 * DAY_MS;
const SEARCH_LIMIT = 1000;
const CORRECTION_LABEL = 'agent-correction';
const TRIAL_DOC = 'docs/practice-trial.md';

const SEARCH_QUERY = `query($q: String!, $after: String) {
  search(query: $q, type: ISSUE, first: 100, after: $after) {
    issueCount
    pageInfo { hasNextPage endCursor }
    nodes {
      ... on PullRequest {
        number title body headRefName createdAt mergedAt
        mergeCommit { oid }
        labels(first: 100) { nodes { name } }
      }
    }
  }
}`;

function fail(message: string): never {
  throw new Error(`trial-metrics: ${message}`);
}

function record(value: unknown, where: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) fail(`expected an object at ${where}`);
  return value as Record<string, unknown>;
}

function text(object: Record<string, unknown>, key: string, where: string): string {
  const value = object[key];
  if (typeof value !== 'string') fail(`expected a string at ${where}.${key}`);
  return value;
}

function integer(object: Record<string, unknown>, key: string, where: string): number {
  const value = object[key];
  if (typeof value !== 'number' || !Number.isInteger(value))
    fail(`expected an integer at ${where}.${key}`);
  return value;
}

function date(object: Record<string, unknown>, key: string, where: string): Date {
  const value = new Date(text(object, key, where));
  if (Number.isNaN(value.getTime())) fail(`expected a timestamp at ${where}.${key}`);
  return value;
}

function parsePr(raw: unknown, where: string): MergedPr {
  const node = record(raw, where);
  const labels = record(node.labels, `${where}.labels`).nodes;
  if (!Array.isArray(labels)) fail(`expected an array at ${where}.labels.nodes`);
  return {
    number: integer(node, 'number', where),
    title: text(node, 'title', where),
    body: text(node, 'body', where),
    headRefName: text(node, 'headRefName', where),
    labels: labels.map((label, i) =>
      text(record(label, `${where}.labels[${String(i)}]`), 'name', where),
    ),
    createdAt: date(node, 'createdAt', where),
    mergedAt: date(node, 'mergedAt', where),
    mergeCommit: text(record(node.mergeCommit, `${where}.mergeCommit`), 'oid', where),
  };
}

function fetchMergedPrs(graphql: GraphQl, q: string): { prs: MergedPr[]; apiCalls: number } {
  const prs: MergedPr[] = [];
  let after: string | null = null;
  let apiCalls = 0;
  for (;;) {
    apiCalls += 1;
    const search = record(
      record(record(graphql(SEARCH_QUERY, { q, after }), 'response').data, 'data').search,
      'data.search',
    );
    const count = integer(search, 'issueCount', 'search');
    if (count > SEARCH_LIMIT)
      fail(
        `${String(count)} PRs match, above GitHub's search cap of ${String(SEARCH_LIMIT)}; narrow the window`,
      );
    const nodes = search.nodes;
    if (!Array.isArray(nodes)) fail('expected an array at search.nodes');
    prs.push(...nodes.map((node, i) => parsePr(node, `search.nodes[${String(i)}]`)));
    const page = record(search.pageInfo, 'search.pageInfo');
    if (page.hasNextPage !== true) return { prs, apiCalls };
    after = text(page, 'endCursor', 'search.pageInfo');
  }
}

function mentions(text: string, repo: string, number: number): boolean {
  const owner = repo.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  return new RegExp(`(?:^|[^\\w/])(?:${owner})?#${String(number)}(?!\\d)`).test(text);
}

function failureCause(pr: MergedPr, later: MergedPr, repo: string): 'revert' | 'hotfix' | 'none' {
  const revertBody = later.body.split('\n').find((line) => line.startsWith('Reverts '));
  if (revertBody !== undefined && mentions(revertBody, repo, pr.number)) return 'revert';
  if (/^revert\b/i.test(later.title) && mentions(later.title, repo, pr.number)) return 'revert';
  const hotfix = /hotfix/i.test(later.title) || /hotfix/i.test(later.headRefName);
  if (hotfix && mentions(`${later.title}\n${later.body}`, repo, pr.number)) return 'hotfix';
  return 'none';
}

function changeFailure(pr: MergedPr, all: MergedPr[], repo: string, now: Date): ChangeFailure {
  const deadline = pr.mergedAt.getTime() + FAILURE_WINDOW_MS;
  for (const later of all) {
    const at = later.mergedAt.getTime();
    if (later.number === pr.number || at < pr.mergedAt.getTime() || at > deadline) continue;
    const kind = failureCause(pr, later, repo);
    if (kind !== 'none') return { kind, by: later.number };
  }
  return now.getTime() < deadline ? { kind: 'pending' } : { kind: 'none' };
}

function git(checkout: string, args: string[]): string {
  return execFileSync('git', ['-C', checkout, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 256 * 1024 * 1024,
  });
}

function frontmatter(text: string): string {
  return /^---\n([\s\S]*?)\n---/.exec(text)?.[1] ?? '';
}

function guidanceTokens(paths: string[], read: (path: string) => string): number {
  const present = new Set(paths);
  const loaded: string[] = [];
  const queue = ['CLAUDE.md'];
  for (let path = queue.shift(); path !== undefined; path = queue.shift()) {
    if (!present.has(path) || loaded.includes(path)) continue;
    loaded.push(path);
    for (const match of read(path).matchAll(/(?:^|\s)@([\w./-]+\.md)/gm)) {
      queue.push(posix.normalize(posix.join(posix.dirname(path), match[1] ?? '')));
    }
  }
  const rules = paths.filter(
    (path) =>
      path.startsWith('.claude/rules/') &&
      path.endsWith('.md') &&
      !frontmatter(read(path)).includes('paths:'),
  );
  const chars = [...loaded, ...rules].reduce((sum, path) => sum + Array.from(read(path)).length, 0);
  return Math.floor(chars / 4);
}

function guidanceReader(checkout: string): (commit: string) => number {
  const blobs = new Map<string, string>();
  return (commit) => {
    let listing: string;
    try {
      listing = git(checkout, ['ls-tree', '-r', '-z', commit]);
    } catch {
      fail(
        `commit ${commit} is not in ${checkout}; pass --checkout a clone of the repository and fetch it`,
      );
    }
    const tree = new Map<string, string>();
    for (const entry of listing.split('\0')) {
      const match = /^\d+ blob ([0-9a-f]+)\t(.+\.md)$/.exec(entry);
      if (match?.[1] && match[2]) tree.set(match[2], match[1]);
    }
    return guidanceTokens([...tree.keys()], (path) => {
      const oid = tree.get(path) ?? fail(`${path} vanished from ${commit}`);
      const text = blobs.get(oid) ?? git(checkout, ['cat-file', 'blob', oid]);
      blobs.set(oid, text);
      return text;
    });
  };
}

function searchQuery(repo: string, since: string, until: string | undefined): string {
  const end =
    until === undefined
      ? '*'
      : new Date(Date.parse(until) + FAILURE_WINDOW_MS).toISOString().slice(0, 10);
  return `repo:${repo} is:pr is:merged merged:${since}..${end}`;
}

export function collect(options: Options): { rows: Row[]; apiCalls: number } {
  const { prs, apiCalls } = fetchMergedPrs(
    options.graphql,
    searchQuery(options.repo, options.since, options.until),
  );
  const tokensAt = guidanceReader(options.checkout);
  const end = options.until === undefined ? Infinity : Date.parse(options.until) + DAY_MS;
  const touches = (pr: MergedPr): boolean =>
    options.path === undefined ||
    git(options.checkout, [
      'diff',
      '--name-only',
      `${pr.mergeCommit}^1`,
      pr.mergeCommit,
      '--',
      options.path,
    ]) !== '';
  const rows = prs
    .filter((pr) => pr.mergedAt.getTime() < end && touches(pr))
    .sort((a, b) => a.mergedAt.getTime() - b.mergedAt.getTime())
    .map((pr) => ({
      pr,
      changeFailure: changeFailure(pr, prs, options.repo, options.now),
      agentCorrection: pr.labels.includes(CORRECTION_LABEL),
      openToMergeHours: (pr.mergedAt.getTime() - pr.createdAt.getTime()) / (60 * 60 * 1000),
      guidanceTokens: tokensAt(pr.mergeCommit),
    }));
  return { rows, apiCalls };
}

function describe(failure: ChangeFailure): string {
  return failure.kind === 'none' || failure.kind === 'pending'
    ? failure.kind
    : `${failure.kind} #${String(failure.by)}`;
}

function rate(hits: number, total: number): string {
  return total === 0
    ? 'n/a'
    : `${String(hits)}/${String(total)} (${((100 * hits) / total).toFixed(1)}%)`;
}

export function format(rows: Row[]): string {
  const lines = [
    '| PR | merged | change failure | agent correction | open to merge (h) | guidance tokens |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows.map(
      (row) =>
        `| #${String(row.pr.number)} | ${row.pr.mergedAt.toISOString().slice(0, 10)} | ${describe(row.changeFailure)} | ${row.agentCorrection ? 'yes' : 'no'} | ${row.openToMergeHours.toFixed(1)} | ${String(row.guidanceTokens)} |`,
    ),
  ];
  const settled = rows.filter((row) => row.changeFailure.kind !== 'pending');
  const failures = settled.filter((row) => row.changeFailure.kind !== 'none').length;
  const hours = rows.map((row) => row.openToMergeHours).sort((a, b) => a - b);
  const median =
    hours.length === 0
      ? 'n/a'
      : (
          ((hours[Math.floor((hours.length - 1) / 2)] ?? 0) +
            (hours[Math.ceil((hours.length - 1) / 2)] ?? 0)) /
          2
        ).toFixed(1);
  return [
    ...lines,
    '',
    `merged PRs: ${String(rows.length)}`,
    `change-failure rate: ${rate(failures, settled.length)}, ${String(rows.length - settled.length)} pending`,
    `agent-correction rate: ${rate(rows.filter((row) => row.agentCorrection).length, rows.length)}`,
    `median open to merge (h): ${median}`,
    '',
  ].join('\n');
}

function trialStart(): string {
  const added = git('.', ['log', 'main', '--diff-filter=A', '--format=%cs', '--', TRIAL_DOC])
    .trim()
    .split('\n')
    .pop();
  if (!added) fail(`${TRIAL_DOC} is not on main yet; pass --since YYYY-MM-DD`);
  return added;
}

function ghGraphQl(query: string, variables: Record<string, string | null>): unknown {
  const args = ['api', 'graphql', '-f', `query=${query}`];
  for (const [key, value] of Object.entries(variables)) {
    if (value !== null) args.push('-f', `${key}=${value}`);
  }
  return JSON.parse(
    execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }),
  ) as unknown;
}

function main(): void {
  const { values } = parseArgs({
    options: {
      repo: { type: 'string', default: 'oaknational/oak-mcp-server' },
      since: { type: 'string' },
      until: { type: 'string' },
      path: { type: 'string' },
      checkout: { type: 'string', default: '.' },
    },
  });
  for (const date of [values.since, values.until]) {
    if (date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(date))
      fail(`dates must be YYYY-MM-DD, got ${date}`);
  }
  const { rows, apiCalls } = collect({
    repo: values.repo,
    since: values.since ?? trialStart(),
    until: values.until,
    path: values.path,
    checkout: values.checkout,
    now: new Date(),
    graphql: ghGraphQl,
  });
  process.stdout.write(format(rows));
  process.stderr.write(`api calls: ${String(apiCalls)}\n`);
}

if (import.meta.main) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

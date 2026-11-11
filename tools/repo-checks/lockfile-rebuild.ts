import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { parse, parseAllDocuments } from 'yaml';

const LOCKFILE = 'pnpm-lock.yaml';

export const REPAIR_COMMAND = `rm -rf node_modules && rm ${LOCKFILE} && pnpm install`;

export function overrideName(key: string): string {
  const target = key.split('>').pop() ?? key;
  const at = target.indexOf('@', 1);
  return at === -1 ? target : target.slice(0, at);
}

interface Hold {
  name: string;
  below: string;
}

export function readHolds(markdown: string): { holds: Hold[]; errors: string[] } {
  const holds: Hold[] = [];
  const errors: string[] = [];
  for (const [, name = '', below] of markdown.matchAll(
    /^[-*]\s+`([^`]+)`(?:\s+below\s+`(\d+(?:\.\d+){0,2})`)?/gm,
  )) {
    if (below === undefined) {
      errors.push(
        `The hold on ${name} declares no bound. Write it as '- \`${name}\` below \`<version>\`: <reason>'.`,
      );
    } else {
      holds.push({ name, below });
    }
  }
  return { holds, errors };
}

function overriddenNames(packageJson: string, workspaceYaml: string): string[] {
  const pkg = JSON.parse(packageJson) as { pnpm?: { overrides?: Record<string, string> } };
  const workspace = (parse(workspaceYaml) ?? {}) as { overrides?: Record<string, string> };
  const keys = [
    ...Object.keys(pkg.pnpm?.overrides ?? {}),
    ...Object.keys(workspace.overrides ?? {}),
  ];
  return [...new Set(keys.map(overrideName))].sort();
}

export function resolvedVersions(lockfile: string): Map<string, string[]> {
  const versions = new Map<string, Set<string>>();
  for (const document of parseAllDocuments(lockfile)) {
    const parsed = (document.toJS() ?? {}) as { packages?: Record<string, unknown> };
    for (const key of Object.keys(parsed.packages ?? {})) {
      const at = key.lastIndexOf('@');
      if (at > 0) {
        const name = key.slice(0, at);
        versions.set(name, (versions.get(name) ?? new Set<string>()).add(key.slice(at + 1)));
      }
    }
  }
  return new Map([...versions].map(([name, set]) => [name, [...set].sort()]));
}

function driftedDependencies(
  names: readonly string[],
  committed: ReadonlyMap<string, string[]>,
  rebuilt: ReadonlyMap<string, string[]>,
): string[] {
  return names.flatMap((name) => {
    const before = (committed.get(name) ?? []).join(', ') || 'not present';
    const after = (rebuilt.get(name) ?? []).join(', ') || 'not present';
    return before === after
      ? []
      : [`${name} resolves to ${after} after a rebuild, but the lockfile has ${before}.`];
  });
}

function releaseParts(version: string): number[] {
  return /^\d+(?:\.\d+)*/.exec(version)?.[0].split('.').map(Number) ?? [];
}

function isBelow(version: string, bound: string): boolean {
  const have = releaseParts(version);
  const limit = releaseParts(bound);
  for (const [index, part] of limit.entries()) {
    const own = have[index] ?? Number.NaN;
    if (own !== part) {
      return own < part;
    }
  }
  return false;
}

function heldOutsideBounds(
  holds: readonly Hold[],
  rebuilt: ReadonlyMap<string, string[]>,
): string[] {
  return holds.flatMap(({ name, below }) =>
    (rebuilt.get(name) ?? [])
      .filter((version) => !isBelow(version, below))
      .map(
        (version) =>
          `${name} resolves to ${version} after a rebuild, outside its hold below ${below}. Check the range in package.json and the Dependabot ignore.`,
      ),
  );
}

export function rebuildProblems(input: {
  packageJson: string;
  workspaceYaml: string;
  holdsMarkdown: string;
  committedLockfile: string;
  rebuiltLockfile: string;
}): string[] {
  const { holds, errors } = readHolds(input.holdsMarkdown);
  const rebuilt = resolvedVersions(input.rebuiltLockfile);
  return [
    ...errors,
    ...driftedDependencies(
      overriddenNames(input.packageJson, input.workspaceYaml),
      resolvedVersions(input.committedLockfile),
      rebuilt,
    ),
    ...heldOutsideBounds(holds, rebuilt),
  ];
}

export function newAdvisories(before: ReadonlySet<string>, after: ReadonlySet<string>): string[] {
  return [...after].filter((id) => !before.has(id)).sort();
}

function pnpm(
  args: string[],
  cwd: string,
  capture = false,
): { status: number | null; stdout: string } {
  const result = spawnSync('pnpm', args, {
    cwd,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, CI: 'true' },
  });
  return { status: result.status, stdout: result.stdout };
}

function advisoryIds(cwd: string): Set<string> {
  const { stdout } = pnpm(['audit', '--json'], cwd, true);
  const report = JSON.parse(stdout) as { advisories?: Record<string, unknown> };
  if (report.advisories === undefined) {
    throw new Error('pnpm audit returned no advisories field, so the audit did not run');
  }
  return new Set(Object.keys(report.advisories));
}

function copyWithoutLockfile(destination: string): void {
  const listed = spawnSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  for (const file of listed.stdout.split('\0').filter(Boolean)) {
    if (file !== LOCKFILE) {
      mkdirSync(dirname(join(destination, file)), { recursive: true });
      copyFileSync(file, join(destination, file));
    }
  }
}

function main(): void {
  if (pnpm(['install', '--frozen-lockfile'], '.').status !== 0) {
    process.stderr.write('lockfile-rebuild: the frozen install failed. Regenerate the lockfile.\n');
    process.exit(1);
  }
  const committedText = readFileSync(LOCKFILE, 'utf8');
  const advisoriesBefore = advisoryIds('.');
  const scratch = mkdtempSync(join(tmpdir(), 'lockfile-rebuild-'));
  let rebuiltText: string;
  let advisoriesAfter: Set<string>;
  try {
    copyWithoutLockfile(scratch);
    if (pnpm(['install', '--lockfile-only'], scratch).status !== 0) {
      throw new Error('resolving without a lockfile failed');
    }
    rebuiltText = readFileSync(join(scratch, LOCKFILE), 'utf8');
    advisoriesAfter = advisoryIds(scratch);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
  const problems = [
    ...rebuildProblems({
      packageJson: readFileSync('package.json', 'utf8'),
      workspaceYaml: readFileSync('pnpm-workspace.yaml', 'utf8'),
      holdsMarkdown: readFileSync('docs/dependency-holds.md', 'utf8'),
      committedLockfile: committedText,
      rebuiltLockfile: rebuiltText,
    }),
    ...newAdvisories(advisoriesBefore, advisoriesAfter).map(
      (id) => `pnpm audit reports new advisory ${id} after a rebuild.`,
    ),
  ];
  if (problems.length > 0) {
    process.stderr.write(
      [
        'lockfile-rebuild: the lockfile does not survive a rebuild.',
        ...problems.map((p) => `- ${p}`),
        `Declare the constraint in package.json or pnpm-workspace.yaml, then run '${REPAIR_COMMAND}' and commit the new lockfile. Keep the rm: pnpm reuses node_modules and rebuilds the same drift without it.`,
        '',
      ].join('\n'),
    );
    process.exit(1);
  }
  process.stdout.write('lockfile-rebuild: ok, overrides and holds survive a rebuild.\n');
}

if (import.meta.main) {
  main();
}

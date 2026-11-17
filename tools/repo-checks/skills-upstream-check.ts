import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

interface Manifest {
  source: string;
  commit: string;
  skills: string[];
}

const VENDORED_ROOTS = ['.agents/skills/', '.claude/skills/'];
const UPSTREAM_PREFIX = 'skills/central/';
const FULL_SHA = /^[0-9a-f]{40}$/;
export const EXPECTED_SOURCE = 'https://github.com/oaknational/oak-agent-skills';

function git(args: string[]): { status: number | null; stdout: Buffer; stderr: string } {
  const result = spawnSync('git', args, { maxBuffer: 256 * 1024 * 1024 });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr.toString('utf8').trim(),
  };
}

function listLocalFiles(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const name = entry.name.split('\\').join('/');
    return entry.isDirectory()
      ? listLocalFiles(join(dir, entry.name)).map((rel) => `${name}/${rel}`)
      : [name];
  });
}

/**
 * Fetches oak-skills.json's pinned commit straight from its source with plain
 * git, lists each selected skill's real upstream file tree, and diffs every
 * one of those files' bytes against both vendored copies (`.agents/skills`
 * and its `.claude/skills` mirror). It also lists each vendored skill
 * directory's real local files and flags any that upstream does not have.
 * The file lists and file content all come from the fetched upstream tree,
 * never from oak-skills.json's own records, so a PR cannot pass by rewriting
 * a changed file's recorded hash, by deleting a vendored file together with
 * its manifest entry, or by adding an extra file together with a matching
 * entry. A pinned `source` other than the real oak-agent-skills repository
 * is refused outright, so a PR cannot point the check at a repository it
 * controls.
 *
 * This does not catch a PR that drops a skill from `manifest.skills`
 * entirely and deletes its vendored directories: that is a far larger,
 * plainly visible diff, and the manifest's `skills` selection is the
 * repository's own record of which skills are vendored, reviewed the same
 * way as any other code change.
 */
export function checkAgainstUpstream(
  root: string,
  manifest: Manifest,
  expectedSource: string = EXPECTED_SOURCE,
): string[] {
  if (manifest.source !== expectedSource) {
    return [`oak-skills.json: "source" must be '${expectedSource}', got '${manifest.source}'`];
  }
  if (!FULL_SHA.test(manifest.commit)) {
    return [`oak-skills.json: "commit" must be a full 40-character SHA, got '${manifest.commit}'`];
  }
  const gitDir = mkdtempSync(join(tmpdir(), 'oak-skills-upstream-'));
  try {
    const init = git(['init', '--quiet', '--bare', gitDir]);
    if (init.status !== 0) {
      return [`could not create a scratch git repository: ${init.stderr}`];
    }
    const fetch = git([
      '--git-dir',
      gitDir,
      'fetch',
      '--quiet',
      '--depth',
      '1',
      manifest.source,
      manifest.commit,
    ]);
    if (fetch.status !== 0) {
      return [
        `could not fetch ${manifest.source}@${manifest.commit} with plain git: ${fetch.stderr || 'git fetch failed'}`,
      ];
    }
    const problems: string[] = [];
    for (const skill of manifest.skills) {
      const upstreamDir = `${UPSTREAM_PREFIX}${skill}`;
      const lsTree = git([
        '--git-dir',
        gitDir,
        'ls-tree',
        '-r',
        '--name-only',
        manifest.commit,
        '--',
        upstreamDir,
      ]);
      const upstreamFiles = lsTree.stdout
        .toString('utf8')
        .split('\n')
        .filter((line) => line !== '');
      if (lsTree.status !== 0 || upstreamFiles.length === 0) {
        problems.push(
          `${skill}: not found at ${upstreamDir} in ${manifest.source}@${manifest.commit}`,
        );
        continue;
      }
      const upstreamRelToSkill = new Set(
        upstreamFiles.map((file) => file.slice(`${upstreamDir}/`.length)),
      );
      for (const upstreamFile of upstreamFiles) {
        const rel = upstreamFile.slice(UPSTREAM_PREFIX.length);
        for (const vendoredRoot of VENDORED_ROOTS) {
          const vendored = vendoredRoot + rel;
          const localPath = join(root, vendored);
          if (!existsSync(localPath)) {
            problems.push(`${vendored}: missing, cannot compare it against upstream`);
            continue;
          }
          const show = git(['--git-dir', gitDir, 'show', `${manifest.commit}:${upstreamFile}`]);
          if (show.status !== 0) {
            problems.push(
              `${vendored}: not found at ${upstreamFile} in ${manifest.source}@${manifest.commit}`,
            );
            continue;
          }
          if (!readFileSync(localPath).equals(show.stdout)) {
            problems.push(
              `${vendored}: differs from ${manifest.source}@${manifest.commit}:${upstreamFile}, whatever oak-skills.json's recorded hash says`,
            );
          }
        }
      }
      for (const vendoredRoot of VENDORED_ROOTS) {
        for (const localRel of listLocalFiles(join(root, vendoredRoot, skill))) {
          if (!upstreamRelToSkill.has(localRel)) {
            problems.push(
              `${vendoredRoot}${skill}/${localRel}: not vendored from ${manifest.source}@${manifest.commit}, remove it or add it upstream and re-pin`,
            );
          }
        }
      }
    }
    return problems;
  } finally {
    rmSync(gitDir, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  const root = resolve(process.argv[2] ?? join(import.meta.dirname, '../..'));
  const manifest = JSON.parse(readFileSync(join(root, 'oak-skills.json'), 'utf8')) as Manifest;
  const problems = checkAgainstUpstream(root, manifest);
  if (problems.length > 0) {
    process.stderr.write(
      `skills-upstream-check: failed\n${problems.map((line) => `  ${line}`).join('\n')}\n`,
    );
    process.exit(1);
  }
  process.stdout.write('skills match upstream\n');
}

import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

interface Manifest {
  skills: string[];
  files: Record<string, string>;
}

const SOURCE = '.agents/skills';
const MIRROR = '.claude/skills';
const CLAUDE_ONLY = new Set(['verify']);
const ROOTS = [SOURCE, MIRROR];

function listFiles(dir: string, symlinks: string[]): string[] {
  if (lstatSync(dir, { throwIfNoEntry: false })?.isSymbolicLink() === true) {
    symlinks.push(dir);
    return [];
  }
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      symlinks.push(path);
      return [];
    }
    return entry.isDirectory() ? listFiles(path, symlinks) : [path];
  });
}

const root = resolve(process.argv[2] ?? join(import.meta.dirname, '../..'));
const manifest = JSON.parse(readFileSync(join(root, 'oak-skills.json'), 'utf8')) as Manifest;
const problems: string[] = [];

for (const [path, expected] of Object.entries(manifest.files)) {
  const full = join(root, path);
  if (!existsSync(full)) {
    problems.push(`${path}: missing, restore it from the pinned upstream commit`);
  } else if (createHash('sha256').update(readFileSync(full)).digest('hex') !== expected) {
    problems.push(`${path}: differs from oak-skills.json, revert the edit or promote it upstream`);
  }
}

for (const base of ROOTS) {
  for (const skill of manifest.skills) {
    const symlinks: string[] = [];
    for (const file of listFiles(join(root, base, skill), symlinks)) {
      const path = relative(root, file).split('\\').join('/');
      if (!(path in manifest.files)) {
        problems.push(`${path}: not in oak-skills.json, remove it or add the skill upstream`);
      }
    }
    for (const link of symlinks) {
      const path = relative(root, link).split('\\').join('/');
      problems.push(`${path}: symlink, vendored skills hold regular files only, remove it`);
    }
  }
  const known = new Set(manifest.skills);
  const dir = join(root, base);
  for (const entry of existsSync(dir) ? readdirSync(dir, { withFileTypes: true }) : []) {
    if (entry.name.startsWith('oak-') && !known.has(entry.name)) {
      problems.push(`${base}/${entry.name}: skill is not selected in oak-skills.json`);
    }
  }
}

const sourceDir = join(root, SOURCE);
for (const entry of existsSync(sourceDir) ? readdirSync(sourceDir, { withFileTypes: true }) : []) {
  if (!entry.isDirectory() || entry.name.startsWith('oak-')) {
    continue;
  }
  const symlinks: string[] = [];
  for (const file of listFiles(join(sourceDir, entry.name), symlinks)) {
    const rel = relative(sourceDir, file).split('\\').join('/');
    const copy = join(root, MIRROR, rel);
    if (!existsSync(copy)) {
      problems.push(`${MIRROR}/${rel}: missing, copy it from ${SOURCE}/${rel}`);
    } else if (!readFileSync(copy).equals(readFileSync(file))) {
      problems.push(`${MIRROR}/${rel}: differs from ${SOURCE}/${rel}, recopy it`);
    }
  }
  for (const link of symlinks) {
    const path = relative(root, link).split('\\').join('/');
    problems.push(`${path}: symlink, local skills hold regular files only, remove it`);
  }
}

const sourceSkills = new Set(
  (existsSync(sourceDir) ? readdirSync(sourceDir, { withFileTypes: true }) : [])
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('oak-'))
    .map((entry) => entry.name),
);
const mirrorDir = join(root, MIRROR);
for (const entry of existsSync(mirrorDir) ? readdirSync(mirrorDir, { withFileTypes: true }) : []) {
  if (entry.name.startsWith('oak-') || CLAUDE_ONLY.has(entry.name)) {
    continue;
  }
  const path = `${MIRROR}/${entry.name}`;
  if (entry.isSymbolicLink()) {
    problems.push(`${path}: symlink, local skills hold regular files only, remove it`);
  } else if (!entry.isDirectory() || !sourceSkills.has(entry.name)) {
    problems.push(`${path}: no counterpart under ${SOURCE}, remove it or add the skill there`);
  } else {
    const links: string[] = [];
    for (const file of listFiles(join(mirrorDir, entry.name), links)) {
      const rel = relative(mirrorDir, file).split('\\').join('/');
      if (!existsSync(join(sourceDir, rel))) {
        problems.push(
          `${MIRROR}/${rel}: no counterpart under ${SOURCE}, remove it or add it there`,
        );
      }
    }
    for (const link of links) {
      const rel = relative(root, link).split('\\').join('/');
      problems.push(`${rel}: symlink, local skills hold regular files only, remove it`);
    }
  }
}

if (problems.length > 0) {
  process.stderr.write(`skills-check: failed\n${problems.map((line) => `  ${line}`).join('\n')}\n`);
  process.exit(1);
}
process.stdout.write('skills in sync\n');

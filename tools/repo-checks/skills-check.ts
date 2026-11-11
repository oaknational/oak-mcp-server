import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

interface Manifest {
  skills: string[];
  files: Record<string, string>;
}

const ROOTS = ['.agents/skills', '.claude/skills'];

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

if (problems.length > 0) {
  process.stderr.write(`skills-check: failed\n${problems.map((line) => `  ${line}`).join('\n')}\n`);
  process.exit(1);
}
process.stdout.write('skills in sync\n');

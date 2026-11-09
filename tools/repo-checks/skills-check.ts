import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

interface Manifest {
  skills: string[];
  files: Record<string, string>;
}

const SOURCE = '.agents/skills';
const MIRROR = '.claude/skills';
const ROOTS = [SOURCE, MIRROR];

function listFiles(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));
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
    for (const file of listFiles(join(root, base, skill))) {
      const path = relative(root, file).split('\\').join('/');
      if (!(path in manifest.files)) {
        problems.push(`${path}: not in oak-skills.json, remove it or add the skill upstream`);
      }
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
  for (const file of listFiles(join(sourceDir, entry.name))) {
    const rel = relative(sourceDir, file).split('\\').join('/');
    const copy = join(root, MIRROR, rel);
    if (!existsSync(copy)) {
      problems.push(`${MIRROR}/${rel}: missing, copy it from ${SOURCE}/${rel}`);
    } else if (!readFileSync(copy).equals(readFileSync(file))) {
      problems.push(`${MIRROR}/${rel}: differs from ${SOURCE}/${rel}, recopy it`);
    }
  }
}

if (problems.length > 0) {
  process.stderr.write(`skills-check: failed\n${problems.map((line) => `  ${line}`).join('\n')}\n`);
  process.exit(1);
}
process.stdout.write('skills in sync\n');

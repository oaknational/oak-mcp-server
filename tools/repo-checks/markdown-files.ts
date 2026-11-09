import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

export const root = join(import.meta.dirname, '..', '..');

export function trackedMarkdownFiles(): string[] {
  const listed = spawnSync('git', ['ls-files', '-z', '--', '*.md'], {
    cwd: root,
    encoding: 'utf8',
  });
  if (listed.status !== 0) throw new Error(`git ls-files failed: ${listed.stderr}`);
  return listed.stdout
    .split('\0')
    .filter((path) => path !== '' && !path.split('/').includes('node_modules'))
    .map((path) => join(root, path))
    .sort();
}

function slug(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/`/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s/g, '-');
}

function headingSlugs(text: string): Set<string> {
  const slugs = new Set<string>();
  for (const match of text.matchAll(/^#{1,6}\s+(.+?)\s*#*$/gm)) {
    slugs.add(slug(match[1] ?? ''));
  }
  return slugs;
}

function withoutCode(text: string): string {
  return text.replace(/^```[\s\S]*?^```/gm, '').replace(/`[^`\n]*`/g, '');
}

export function brokenLinks(file: string): string[] {
  const text = withoutCode(readFileSync(file, 'utf8'));
  const broken: string[] = [];
  for (const match of text.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
    const target = match[1] ?? '';
    if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
    const [path = '', fragment] = target.split('#');
    const resolved = path === '' ? file : resolve(dirname(file), path);
    let destination: string;
    try {
      destination = readFileSync(resolved, 'utf8');
    } catch {
      broken.push(`${relative(root, file)} -> ${target}`);
      continue;
    }
    if (fragment && resolved.endsWith('.md') && !headingSlugs(destination).has(fragment)) {
      broken.push(`${relative(root, file)} -> ${target}`);
    }
  }
  return broken;
}

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

function withoutFences(text: string): string {
  return text.replace(/^```[\s\S]*?^```/gm, '');
}

function headingSlugs(text: string): Set<string> {
  const slugs = new Set<string>();
  const seen = new Map<string, number>();
  for (const match of withoutFences(text).matchAll(/^#{1,6}\s+(.+?)\s*#*$/gm)) {
    const base = slug(match[1] ?? '');
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    slugs.add(count === 0 ? base : `${base}-${String(count)}`);
  }
  return slugs;
}

function withoutCode(text: string): string {
  return withoutFences(text).replace(/`[^`\n]*`/g, '');
}

function linkTargets(text: string): string[] {
  const inline = text.matchAll(/\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g);
  const definitions = text.matchAll(/^ {0,3}\[[^\]^][^\]]*\]:\s*<?(\S+?)>?(?:\s.*)?$/gm);
  return [...inline, ...definitions].map((match) => match[1] ?? '');
}

export function brokenLinks(file: string): string[] {
  const text = withoutCode(readFileSync(file, 'utf8'));
  const broken: string[] = [];
  for (const target of linkTargets(text)) {
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

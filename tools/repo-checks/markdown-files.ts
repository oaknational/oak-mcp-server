import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

import GithubSlugger from 'github-slugger';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { gfm } from 'micromark-extension-gfm';
import { visit } from 'unist-util-visit';

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

function parse(text: string) {
  return fromMarkdown(text, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] });
}

function headingSlugs(text: string): Set<string> {
  const slugger = new GithubSlugger();
  const slugs = new Set<string>();
  visit(parse(text), 'heading', (heading) => {
    let title = '';
    visit(heading, (node) => {
      if (node.type === 'text' || node.type === 'inlineCode') title += node.value;
    });
    slugs.add(slugger.slug(title));
  });
  return slugs;
}

function linkTargets(text: string): string[] {
  const targets: string[] = [];
  visit(parse(text), (node) => {
    if (node.type === 'link' || node.type === 'image' || node.type === 'definition') {
      targets.push(node.url);
    }
  });
  return targets;
}

/** Decodes a link's path component, tolerating one that was never encoded. */
function decodePathTarget(rawPath: string): string {
  try {
    return decodeURIComponent(rawPath);
  } catch {
    return rawPath;
  }
}

export function brokenLinks(file: string): string[] {
  const broken: string[] = [];
  for (const target of linkTargets(readFileSync(file, 'utf8'))) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
    const [rawPath = '', fragment] = target.split('#');
    const path = decodePathTarget(rawPath);
    const resolved = path === '' ? file : resolve(dirname(file), path);
    let destination: string;
    try {
      destination = readFileSync(resolved, 'utf8');
    } catch (error) {
      // A directory has no markdown content to read a heading from, so a
      // fragment on a directory link can never resolve. Read the directory
      // in the same call that detects it, rather than stat-then-read, so a
      // path that changes between the two can't be read as something else.
      if ((error as NodeJS.ErrnoException).code === 'EISDIR') {
        if (fragment) broken.push(`${relative(root, file)} -> ${target}`);
        continue;
      }
      broken.push(`${relative(root, file)} -> ${target}`);
      continue;
    }
    if (fragment && resolved.endsWith('.md') && !headingSlugs(destination).has(fragment)) {
      broken.push(`${relative(root, file)} -> ${target}`);
    }
  }
  return broken;
}

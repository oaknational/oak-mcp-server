import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const OUT_DIR = new URL('../out/', import.meta.url).pathname;
const META = /<meta http-equiv="Content-Security-Policy"[^>]*>/;

const sha256 = (text: string): string =>
  `'sha256-${createHash('sha256').update(text).digest('base64')}'`;

// Chromium reports the empty <style> element styled-components creates unless its hash is allowed.
const EMPTY_STYLE = sha256('');

function inlineHashes(html: string, tag: 'script' | 'style'): string[] {
  const pattern = new RegExp(`<${tag}(?![^>]*\\ssrc=)[^>]*>([\\s\\S]*?)</${tag}>`, 'g');
  return [...html.matchAll(pattern)].map((match) => sha256(match[1] ?? ''));
}

const sources = (list: readonly string[]): string => [...new Set(list)].join(' ');

function buildPolicy(html: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' ${sources(inlineHashes(html, 'script'))}`.trim(),
    `style-src 'self' ${sources([EMPTY_STYLE, ...inlineHashes(html, 'style')])}`,
    "img-src 'self' data:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}

async function htmlFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return htmlFiles(path);
      return entry.name.endsWith('.html') ? [path] : [];
    }),
  );
  return nested.flat();
}

for (const file of await htmlFiles(OUT_DIR)) {
  const html = await readFile(file, 'utf8');
  const policy = buildPolicy(html.replace(META, ''));
  const meta = `<meta http-equiv="Content-Security-Policy" content="${policy}"/>`;
  await writeFile(
    file,
    META.test(html) ? html.replace(META, meta) : html.replace('<head>', `<head>${meta}`),
  );
}

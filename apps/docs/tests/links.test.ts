import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const OUT_DIR = fileURLToPath(new URL('../out/', import.meta.url));

function htmlFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return htmlFiles(path);
    return entry.name.endsWith('.html') ? [path] : [];
  });
}

const decode = (value: string): string => value.replaceAll('&amp;', '&');

const anchorHrefs = (html: string): string[] =>
  [...html.matchAll(/<a\b[^>]*\shref="([^"]*)"/g)].map((match) => decode(match[1] ?? ''));

const ids = (html: string): Set<string> =>
  new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((match) => decode(match[1] ?? '')));

function pageFor(urlPath: string): string | undefined {
  const candidates = urlPath.endsWith('/')
    ? [join(urlPath, 'index.html')]
    : [urlPath, `${urlPath}.html`, join(urlPath, 'index.html')];
  return candidates
    .map((candidate) => join(OUT_DIR, candidate))
    .find((file) => statSync(file, { throwIfNoEntry: false })?.isFile() === true);
}

const pagePathOf = (file: string): string =>
  `/${relative(OUT_DIR, file).replace(/index\.html$/, '')}`;

function brokenLinks(html: string, pagePath: string): string[] {
  return anchorHrefs(html).flatMap((href) => {
    if (!href.startsWith('#') && !(href.startsWith('/') && !href.startsWith('//'))) return [];
    const target = new URL(href, `http://docs.invalid${pagePath}`);
    const targetFile = pageFor(decodeURIComponent(target.pathname));
    if (targetFile === undefined) return [`${href} (no page)`];
    const fragment = decodeURIComponent(target.hash.slice(1));
    if (fragment !== '' && !ids(readFileSync(targetFile, 'utf8')).has(fragment)) {
      return [`${href} (no element with id "${fragment}")`];
    }
    return [];
  });
}

describe('internal links in the static export', () => {
  const files = htmlFiles(OUT_DIR);

  it('exports the content pages', () => {
    const exported = files.map((file) => `/${relative(OUT_DIR, file)}`);
    expect(exported).toEqual(expect.arrayContaining(['/index.html', '/connect/index.html']));
  });

  it.each(files.map((file) => [relative(OUT_DIR, file), file]))(
    'every internal link in %s resolves',
    (_name, file) => {
      expect(brokenLinks(readFileSync(file, 'utf8'), pagePathOf(file))).toEqual([]);
    },
  );

  it('reports a link to a missing page or a missing fragment, and ignores external links', () => {
    const html = [
      '<a href="/no-such-page/">missing page</a>',
      '<a href="/connect/#no-such-fragment">missing fragment</a>',
      '<a href="#main">same page</a>',
      '<a href="/tools/">present page</a>',
      '<a href="https://example.invalid/">external</a>',
      '<main id="main"></main>',
    ].join('');
    expect(brokenLinks(html, '/')).toEqual([
      '/no-such-page/ (no page)',
      '/connect/#no-such-fragment (no element with id "no-such-fragment")',
    ]);
  });
});

describe('styled-components ids in the static export', () => {
  it.each(htmlFiles(OUT_DIR).map((file) => [relative(OUT_DIR, file), file]))(
    '%s uses only compiler-assigned component ids',
    (_name, file) => {
      const classes = [...readFileSync(file, 'utf8').matchAll(/\sclass="([^"]*)"/g)].flatMap(
        (match) => (match[1] ?? '').split(/\s+/),
      );
      expect(classes.filter((name) => /^sc-[A-Za-z]+$/.test(name))).toEqual([]);
    },
  );
});

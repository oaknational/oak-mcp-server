import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { brokenLinks, root, trackedMarkdownFiles } from './markdown-files.js';

const fixtures = join(import.meta.dirname, 'fixtures');
const scanned = trackedMarkdownFiles().filter((file) => !file.startsWith(fixtures));

describe('markdown links', () => {
  it('scans root files as well as docs', () => {
    const names = scanned.map((file) => file.slice(root.length + 1));
    expect(names).toEqual(
      expect.arrayContaining(['README.md', 'LICENCE-DATA.md', 'docs/adr/README.md']),
    );
  });

  it.each(scanned.map((file) => [file.slice(root.length + 1), file]))(
    '%s has no broken relative link',
    (_name, file) => {
      expect(brokenLinks(file)).toEqual([]);
    },
  );

  it('reports a link to a missing file', () => {
    expect(brokenLinks(join(fixtures, 'broken-link.md'))).toEqual([
      'tools/repo-checks/fixtures/broken-link.md -> nowhere.md',
    ]);
  });

  it('reports a link to a missing heading anchor', () => {
    expect(brokenLinks(join(fixtures, 'broken-anchor.md'))).toEqual([
      'tools/repo-checks/fixtures/broken-anchor.md -> #no-such-heading',
    ]);
  });
});

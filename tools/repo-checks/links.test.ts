import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { brokenLinks, markdownFilesUnder, root } from './markdown-files.js';

describe('markdown links', () => {
  const files = [join(root, 'README.md'), ...markdownFilesUnder(join(root, 'docs'))];

  it.each(files.map((file) => [file.slice(root.length + 1), file]))(
    '%s has no broken relative link',
    (_name, file) => {
      expect(brokenLinks(file)).toEqual([]);
    },
  );

  it('reports a link to a missing file', () => {
    const fixture = join(import.meta.dirname, 'fixtures', 'broken-link.md');
    expect(brokenLinks(fixture)).toEqual([
      'tools/repo-checks/fixtures/broken-link.md -> nowhere.md',
    ]);
  });
});

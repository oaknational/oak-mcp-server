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

  it('ignores headings inside fenced code blocks', () => {
    expect(brokenLinks(join(fixtures, 'fenced-heading.md'))).toEqual([
      'tools/repo-checks/fixtures/fenced-heading.md -> #example',
    ]);
  });

  it('numbers repeated headings the way GitHub does', () => {
    expect(brokenLinks(join(fixtures, 'duplicate-headings.md'))).toEqual([
      'tools/repo-checks/fixtures/duplicate-headings.md -> #install-2',
    ]);
  });

  it('checks titled inline links and reference definitions', () => {
    expect(brokenLinks(join(fixtures, 'titled-and-reference-links.md'))).toEqual([
      'tools/repo-checks/fixtures/titled-and-reference-links.md -> missing-titled.md',
      'tools/repo-checks/fixtures/titled-and-reference-links.md -> missing-single.md',
      'tools/repo-checks/fixtures/titled-and-reference-links.md -> missing-reference.md',
    ]);
  });

  it('reports every one of consecutive reference definitions', () => {
    expect(brokenLinks(join(fixtures, 'consecutive-definitions.md'))).toEqual([
      'tools/repo-checks/fixtures/consecutive-definitions.md -> gone-first.md',
      'tools/repo-checks/fixtures/consecutive-definitions.md -> gone-second.md',
    ]);
  });

  it('ignores headings inside tilde fences', () => {
    expect(brokenLinks(join(fixtures, 'tilde-fence-heading.md'))).toEqual([
      'tools/repo-checks/fixtures/tilde-fence-heading.md -> #shown-only-in-fence',
    ]);
  });

  it('ignores headings inside a four-backtick fence that holds a fence', () => {
    expect(brokenLinks(join(fixtures, 'long-fence.md'))).toEqual([
      'tools/repo-checks/fixtures/long-fence.md -> #inside-long-fence',
    ]);
  });

  it('checks an angle-bracket target with a space', () => {
    expect(brokenLinks(join(fixtures, 'angle-target.md'))).toEqual([
      'tools/repo-checks/fixtures/angle-target.md -> gone with space.md',
    ]);
  });

  it('checks a target that contains parentheses', () => {
    expect(brokenLinks(join(fixtures, 'parenthesised-target.md'))).toEqual([
      'tools/repo-checks/fixtures/parenthesised-target.md -> missing(1).md',
    ]);
  });
});

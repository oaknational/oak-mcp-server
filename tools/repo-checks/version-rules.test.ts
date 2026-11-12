import { describe, expect, it } from 'vitest';

import { checkVersion, isRuntimeFile } from './version-rules.ts';

const runtime = ['packages/search/src/index.ts'];
const docsOnly = ['README.md', 'docs/guide.md'];
const verdict = (title: string, changed: string[], body = ''): string[] =>
  checkVersion({ title, body, changed });

describe('version-rules', () => {
  it('refuses a ! after the type', () => {
    expect(verdict('MCP-1: feat(server)!: x', runtime).join('\n')).toContain("'!'");
  });

  it('refuses a BREAKING CHANGE footer', () => {
    expect(
      verdict('MCP-1: fix: x', runtime, 'Why.\n\nBREAKING CHANGE: gone\n').join('\n'),
    ).toContain('BREAKING CHANGE');
  });

  it('refuses a non-releasing type that changes runtime code', () => {
    expect(verdict('MCP-1: chore: tidy', runtime).join('\n')).toContain("'chore' does not release");
  });

  it.each(['docs', 'ci', 'test'])('refuses %s over runtime code', (type) => {
    expect(verdict(`MCP-1: ${type}: x`, runtime)).not.toEqual([]);
  });

  it('refuses feat or fix when the diff has no runtime code', () => {
    expect(verdict('MCP-1: feat: x', docsOnly).join('\n')).toContain("'feat' releases");
    expect(verdict('MCP-1: fix: x', docsOnly)).not.toEqual([]);
  });

  it('passes a fix over runtime code', () => {
    expect(verdict('MCP-1: fix: x', runtime)).toEqual([]);
  });

  it('passes a chore over docs only', () => {
    expect(verdict('MCP-1: chore: x', docsOnly)).toEqual([]);
  });

  it('leaves a title it cannot parse to pr-title', () => {
    expect(verdict('update stuff', runtime)).toEqual([]);
  });

  it('does not count tests, markdown or manifests as runtime code', () => {
    expect(isRuntimeFile('packages/a/src/a.test.ts')).toBe(false);
    expect(isRuntimeFile('apps/server/README.md')).toBe(false);
    expect(isRuntimeFile('packages/a/package.json')).toBe(false);
    expect(isRuntimeFile('apps/server/src/main.ts')).toBe(true);
  });
});

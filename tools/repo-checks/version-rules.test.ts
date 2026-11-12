import { describe, expect, it } from 'vitest';

import type { JsonObject, SurfaceSnapshot } from '../surface-diff/surface-diff.ts';
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

  it('does not count the generated served surface as runtime code', () => {
    expect(verdict('MCP-1: chore: x', ['apps/server/served-surface.json'])).toEqual([]);
    expect(isRuntimeFile('apps/server/served-surface.json')).toBe(false);
    expect(isRuntimeFile('apps/server/vercel.json')).toBe(true);
    expect(verdict('MCP-1: chore: x', ['apps/server/vercel.json'])).not.toEqual([]);
  });

  it('does not count tests, markdown or manifests as runtime code', () => {
    expect(isRuntimeFile('packages/a/src/a.test.ts')).toBe(false);
    expect(isRuntimeFile('apps/server/README.md')).toBe(false);
    expect(isRuntimeFile('packages/a/package.json')).toBe(false);
    expect(isRuntimeFile('apps/server/src/main.ts')).toBe(true);
  });

  describe('served surface', () => {
    const lookup: JsonObject = {
      name: 'fixture-lookup',
      description: 'Look up a fixture.',
      inputSchema: { type: 'object', properties: { id: { type: 'string' } } },
      outputSchema: { type: 'object', properties: { title: { type: 'string' } } },
    };
    const surfaceOf = (tools: Record<string, JsonObject>): SurfaceSnapshot => ({
      server: { serverInfo: { name: 'fixture-server' } },
      tools,
      resources: {},
      resourceTemplates: {},
      prompts: {},
    });
    const base = surfaceOf({ 'fixture-lookup': lookup });
    const withLookup = (patch: JsonObject): SurfaceSnapshot =>
      surfaceOf({ 'fixture-lookup': { ...lookup, ...patch } });
    const surfaceVerdict = (title: string, after: SurfaceSnapshot, body = ''): string =>
      checkVersion({ title, body, changed: runtime, surface: { before: base, after } }).join('\n');
    const breakingBody = 'Why.\n\n## Breaking change\n\nClients must send id.\n';

    it('passes an unchanged surface under chore', () => {
      expect(
        checkVersion({
          title: 'MCP-1: chore: x',
          body: '',
          changed: docsOnly,
          surface: { before: base, after: base },
        }),
      ).toEqual([]);
    });

    it('refuses a non-releasing type that changes a served tool', () => {
      const after = withLookup({ description: 'Look up a fixture by id.' });
      expect(surfaceVerdict('MCP-1: chore: tidy', after)).toContain('must release');
      expect(surfaceVerdict('MCP-1: feat: describe', after)).toBe('');
    });

    it('needs a Breaking change section when a tool is removed', () => {
      const after = surfaceOf({});
      expect(surfaceVerdict('MCP-1: chore: tidy', after)).toContain('must release');
      expect(surfaceVerdict('MCP-1: feat: remove tool', after)).toContain(
        `removes or renames tool "fixture-lookup"`,
      );
      expect(surfaceVerdict('MCP-1: feat: remove tool', after, breakingBody)).toBe('');
    });

    it('treats a rename as a removal', () => {
      const after = surfaceOf({ 'fixture-find': { ...lookup, name: 'fixture-find' } });
      expect(surfaceVerdict('MCP-1: feat: rename', after)).toContain('## Breaking change');
    });

    it('needs a Breaking change section for a newly required parameter', () => {
      const after = withLookup({
        inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      });
      expect(surfaceVerdict('MCP-1: feat: require id', after)).toContain(
        'makes id required on tool "fixture-lookup"',
      );
      expect(surfaceVerdict('MCP-1: feat: require id', after, breakingBody)).toBe('');
    });

    it('needs a Breaking change section for a changed output shape', () => {
      const after = withLookup({ outputSchema: { type: 'object', properties: {} } });
      expect(surfaceVerdict('MCP-1: fix: shape', after)).toContain(
        'changes the output shape of tool "fixture-lookup"',
      );
    });

    it('does not count an added tool as breaking', () => {
      const after = surfaceOf({
        'fixture-lookup': lookup,
        'fixture-extra': { ...lookup, name: 'fixture-extra' },
      });
      expect(surfaceVerdict('MCP-1: feat: add tool', after)).toBe('');
    });

    it('skips the surface rules when the base has no baseline', () => {
      expect(
        checkVersion({
          title: 'MCP-1: chore: x',
          body: '',
          changed: docsOnly,
          surface: { before: undefined, after: base },
        }),
      ).toEqual([]);
    });
  });
});

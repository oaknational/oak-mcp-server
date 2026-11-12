import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { loadReference } from '../reference/load.ts';
import { SERVED_SURFACE_PATH, toReference } from '../reference/surface.ts';

const snapshot: unknown = JSON.parse(readFileSync(SERVED_SURFACE_PATH, 'utf8'));

const names = (entries: readonly { readonly name: string }[]): string[] =>
  entries.map((entry) => entry.name).sort();

describe('docs reference', () => {
  const reference = loadReference();
  const served = toReference(snapshot);

  it('lists exactly the tools in the committed served-surface.json', () => {
    expect(names(reference.tools)).toEqual(names(served.tools));
  });

  it('lists exactly the resources and prompts in the committed served-surface.json', () => {
    expect(names(reference.resources)).toEqual(names(served.resources));
    expect(names(reference.resourceTemplates)).toEqual(names(served.resourceTemplates));
    expect(names(reference.prompts)).toEqual(names(served.prompts));
  });

  it('gives every tool a title, a description, annotations and an input schema', () => {
    for (const tool of reference.tools) {
      expect(tool.title, tool.name).toBeTruthy();
      expect(tool.description, tool.name).toBeTruthy();
      expect(tool.annotations, tool.name).toBeDefined();
      expect(tool.inputSchema, tool.name).toHaveProperty('type', 'object');
    }
  });

  const surfaceOf = (surface: Record<string, unknown>) => ({
    surface: { tools: {}, resources: {}, resourceTemplates: {}, prompts: {}, ...surface },
  });

  it.each([
    ['a non-object document', [], 'the document is not an object'],
    ['a missing surface', { source: 'x' }, 'surface is not an object'],
    ['a list instead of a keyed object', surfaceOf({ tools: [] }), 'tools is not an object'],
    [
      'a tool keyed by another name',
      surfaceOf({ tools: { a: { name: 'b', inputSchema: {} } } }),
      'tools.a has a different name',
    ],
    [
      'a tool without an input schema',
      surfaceOf({ tools: { x: { name: 'x' } } }),
      'tools[0].inputSchema is not an object',
    ],
  ])('rejects %s', (_case, input, message) => {
    expect(() => toReference(input)).toThrow(message);
  });
});

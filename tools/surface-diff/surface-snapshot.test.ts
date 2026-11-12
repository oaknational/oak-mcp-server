import { describe, expect, it } from 'vitest';
import type { JsonObject, SurfaceSnapshot } from './surface-diff.ts';
import { checkSnapshot, renderSnapshot } from './surface-snapshot.ts';

const lookup: JsonObject = {
  name: 'fixture-lookup',
  title: 'Fixture lookup',
  description: 'Look up a fixture.',
  annotations: { readOnlyHint: true },
  inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
};

function surfaceOf(tools: Record<string, JsonObject>): SurfaceSnapshot {
  return {
    server: { serverInfo: { name: 'fixture-server' } },
    tools,
    resources: { 'docs://fixture/readme.md': { uri: 'docs://fixture/readme.md', name: 'readme' } },
    resourceTemplates: {},
    prompts: {},
  };
}

describe('surface snapshot', () => {
  it('renders the same text whatever the key order', async () => {
    const reordered: JsonObject = Object.fromEntries(Object.entries(lookup).reverse());
    const extra = { ...lookup, name: 'fixture-extra' };
    const first = await renderSnapshot(
      surfaceOf({ 'fixture-lookup': lookup, 'fixture-extra': extra }),
    );
    const second = await renderSnapshot(
      surfaceOf({ 'fixture-extra': extra, 'fixture-lookup': reordered }),
    );
    expect(second).toBe(first);
    expect(first.indexOf('"fixture-extra"')).toBeLessThan(first.indexOf('"fixture-lookup"'));
  });

  it('passes a committed file that matches the served surface', async () => {
    const surface = surfaceOf({ 'fixture-lookup': lookup });
    expect(await checkSnapshot(await renderSnapshot(surface), surface)).toBeUndefined();
  });

  it('fails a stale file and names the tool and field', async () => {
    const committed = await renderSnapshot(surfaceOf({ 'fixture-lookup': lookup }));
    const current = surfaceOf({
      'fixture-lookup': { ...lookup, description: 'Look up a fixture by id.' },
    });
    const problem = await checkSnapshot(committed, current);
    expect(problem).toContain('is stale');
    expect(problem).toContain('changed tool "fixture-lookup" field description');
  });

  it('fails a hand-edited layout with the same content', async () => {
    const surface = surfaceOf({ 'fixture-lookup': lookup });
    const problem = await checkSnapshot(JSON.stringify({ surface }), surface);
    expect(problem).toContain('layout differs');
  });

  it('fails when the file is missing', async () => {
    expect(await checkSnapshot(undefined, surfaceOf({}))).toContain('is missing');
  });
});

import { describe, expect, it } from 'vitest';

import { readReference } from '../scripts/generate-reference.ts';
import { loadReference } from '../reference/load.ts';
import { importServerModule } from '../reference/server.ts';

interface ServedSurfaceModule {
  readonly SERVED_SURFACE: { readonly resources: Readonly<Record<string, 'live' | 'dormant'>> };
  readonly liveToolNames: (definition: ServedSurfaceModule['SERVED_SURFACE']) => readonly string[];
}

const { SERVED_SURFACE, liveToolNames } = await importServerModule<ServedSurfaceModule>(
  'served-surface/served-surface.ts',
);

const sorted = (names: readonly string[]): string[] => [...names].sort();

describe('docs reference', () => {
  const reference = loadReference();

  it("lists exactly the served surface's live tools", () => {
    expect(sorted(reference.tools.map((tool) => tool.name))).toEqual(
      sorted(liveToolNames(SERVED_SURFACE)),
    );
  });

  it("lists exactly the served surface's live resources", () => {
    const live = Object.entries(SERVED_SURFACE.resources)
      .filter(([, state]) => state === 'live')
      .map(([uri]) => uri);
    expect(sorted(reference.resources.map((resource) => resource.uri))).toEqual(sorted(live));
  });

  it('gives every tool a title, a description, annotations and an input schema', () => {
    for (const tool of reference.tools) {
      expect(tool.title, tool.name).toBeTruthy();
      expect(tool.description, tool.name).toBeTruthy();
      expect(tool.annotations, tool.name).toBeDefined();
      expect(tool.inputSchema, tool.name).toHaveProperty('type', 'object');
    }
  });

  it('fails when the server cannot start', async () => {
    await expect(
      readReference(() => Promise.reject(new Error('server startup failed'))),
    ).rejects.toThrow('server startup failed');
  });
});

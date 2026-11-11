import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { generateSchemaArtifacts } from '../code-generation/codegen-core.js';
import { createOpenCurriculumSchema } from '../code-generation/schema-separation-core.js';
import { validateOpenApiDocument } from '../code-generation/schema-validator.js';

const packageRoot = join(import.meta.dirname, '..');
const GENERATED = 'src/types/generated';
const roots: string[] = [];

function readTree(directory: string): Map<string, string> {
  const files = readdirSync(directory, { recursive: true, withFileTypes: true }).filter((entry) =>
    entry.isFile(),
  );
  return new Map(
    files.map((entry) => {
      const path = join(entry.parentPath, entry.name);
      return [relative(directory, path), readFileSync(path, 'utf8')];
    }),
  );
}

function readSnapshot(): Record<string, unknown> {
  const raw = readFileSync(join(packageRoot, 'schema-cache/api-schema-original.json'), 'utf8');
  return JSON.parse(raw) as Record<string, unknown>;
}

async function generate(schema: unknown): Promise<Map<string, string>> {
  const root = mkdtempSync(join(tmpdir(), 'codegen-drift-'));
  roots.push(root);
  const { original, sdk } = createOpenCurriculumSchema(validateOpenApiDocument(schema));
  await generateSchemaArtifacts(original, sdk, join(root, GENERATED, 'api-schema'));
  return readTree(join(root, GENERATED));
}

function changedFiles(a: Map<string, string>, b: Map<string, string>): string[] {
  return [...new Set([...a.keys(), ...b.keys()])].filter((path) => a.get(path) !== b.get(path));
}

afterAll(() => {
  for (const root of roots) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('codegen from the committed schema snapshot', () => {
  it('reproduces the committed generated files', async () => {
    const generated = await generate(readSnapshot());
    const committed = readTree(join(packageRoot, GENERATED));
    const differing = [...generated.keys()].filter(
      (path) => generated.get(path) !== committed.get(path),
    );
    expect(generated.size).toBeGreaterThan(0);
    expect(differing).toEqual([]);
  }, 60_000);

  it('changes the generated tree when one snapshot field changes', async () => {
    const before = await generate(readSnapshot());
    const mutated = readSnapshot();
    const paths = mutated['paths'] as Record<string, { get: { description: string } }>;
    const operation = paths['/sequences/{sequence}'];
    if (operation === undefined) {
      throw new Error('the snapshot lacks /sequences/{sequence}');
    }
    operation.get.description = 'A description changed by the drift test.';
    const after = await generate(mutated);
    expect(changedFiles(before, after)).toContain('api-schema/api-paths-types.ts');
  }, 60_000);
});

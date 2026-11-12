import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import {
  createSearchFileMap,
  sdkSchemaFromCodegen,
  writeSearchFiles,
} from '../code-generation/searchgen.js';

const packageRoot = join(import.meta.dirname, '..');
const GENERATED = 'src/types/generated';
const SUBJECT_HIERARCHY = 'search/subject-hierarchy.ts';
const roots: string[] = [];

function readTree(directory: string): Map<string, string> {
  if (!existsSync(directory)) {
    return new Map();
  }
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

afterAll(() => {
  for (const root of roots) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('search codegen from the schema packages/codegen generated', () => {
  it('reproduces the committed generated files, and nothing else', () => {
    const root = mkdtempSync(join(tmpdir(), 'search-drift-'));
    roots.push(root);
    writeSearchFiles(root, createSearchFileMap(sdkSchemaFromCodegen()));
    const generated = readTree(join(root, GENERATED));
    const committed = readTree(join(packageRoot, GENERATED));
    expect(generated.size).toBeGreaterThan(0);
    expect([...committed.keys()].sort()).toEqual([...generated.keys(), SUBJECT_HIERARCHY].sort());
    expect(
      [...generated.keys()].filter((path) => generated.get(path) !== committed.get(path)),
    ).toEqual([]);
  }, 60_000);
});

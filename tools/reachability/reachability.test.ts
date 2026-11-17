import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  analyse,
  deadUnitsInReachableFiles,
  devOnlyUnitsInCalledFiles,
  type ReachabilityConfig,
} from './reachability.ts';

const FIXTURE: Record<string, string> = {
  'tsconfig.json': JSON.stringify({
    compilerOptions: { module: 'NodeNext', moduleResolution: 'NodeNext', strict: true },
    include: ['src/**/*.ts', 'scripts/**/*.ts'],
  }),
  'src/entry.ts': [
    "import { run } from './barrel.js';",
    "import type { Shape } from './types.js';",
    "import { unused } from './loaded.js';",
    "import { maybeDiagnostics } from './gate.js';",
    'const shape: Shape = { size: 1 };',
    'run(shape);',
    'maybeDiagnostics();',
    'void unused;',
  ].join('\n'),
  'src/barrel.ts': "export { run } from './used.js';",
  'src/used.ts': [
    "import type { Shape } from './types.js';",
    '// a comment line',
    'export function run(shape: Shape): number {',
    '  return shape.size;',
    '}',
    '',
    'export function neverCalled(): number {',
    '  return 2;',
    '}',
  ].join('\n'),
  'src/types.ts': 'export interface Shape {\n  size: number;\n}',
  'src/loaded.ts': [
    'export const unused = 1;',
    'export function loadedOnly(): number {',
    '  return 3;',
    '}',
  ].join('\n'),
  'src/gate.ts': [
    "import { diagnosticRoute } from './diagnostics.js';",
    'export function maybeDiagnostics(): void {',
    "  if (process.env['DIAG']) diagnosticRoute();",
    '}',
  ].join('\n'),
  'src/diagnostics.ts': 'export function diagnosticRoute(): void {}',
  'src/tooling.ts': 'export function buildManifest(): string {\n  return "m";\n}',
  'src/orphan.ts': 'export function orphan(): number {\n  return 4;\n}',
  'src/orphan.test.ts': "import { orphan } from './orphan.js';\norphan();",
  'scripts/build.ts': "import { buildManifest } from '../src/tooling.js';\nbuildManifest();",
};

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'reachability-'));
  for (const [path, text] of Object.entries(FIXTURE)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), `${text}\n`);
  }
  return root;
}

const CONFIG: ReachabilityConfig = {
  tsconfig: 'tsconfig.json',
  scope: 'src',
  testOnly: [],
  roots: ['src/entry.ts'],
  devRoots: ['scripts/'],
  devGates: [{ file: 'src/diagnostics.ts', name: 'diagnosticRoute' }],
  anchors: { run: 'src/used.ts', diagnostics: 'src/diagnostics.ts', ghost: 'src/ghost.ts' },
  groups: { gated: ['src/gate.ts', 'src/diagnostics.ts'] },
};

describe('analyse', () => {
  const analysis = analyse(CONFIG, fixture());
  const bucketOf = (file: string): string | undefined =>
    analysis.files.find((row) => row.file === file)?.bucket;

  it('buckets each runtime file by how production reaches it', () => {
    expect(Object.fromEntries(analysis.files.map((row) => [row.file, row.bucket]))).toEqual({
      'src/barrel.ts': 'called',
      'src/diagnostics.ts': 'dev-only-ships',
      'src/entry.ts': 'called',
      'src/gate.ts': 'called',
      'src/loaded.ts': 'called',
      'src/orphan.ts': 'unreachable',
      'src/tooling.ts': 'dev-only-tooling',
      'src/types.ts': 'type-only',
      'src/used.ts': 'called',
    });
  });

  it('leaves test files out and counts the tests that import a file', () => {
    expect(bucketOf('src/orphan.test.ts')).toBeUndefined();
    expect(analysis.files.find((row) => row.file === 'src/orphan.ts')?.importedByTests).toBe(1);
  });

  it('finds declarations no path reaches inside reachable files', () => {
    expect(
      deadUnitsInReachableFiles(analysis).map(({ file, unit }) => `${file}:${unit.name}`),
    ).toEqual(['src/loaded.ts:loadedOnly', 'src/used.ts:neverCalled']);
  });

  it('counts physical and code lines, skipping comments and blanks', () => {
    expect(analysis.files.find((row) => row.file === 'src/used.ts')?.lines).toEqual({
      physical: 9,
      code: 7,
    });
  });

  it('reports each entry anchor bucket', () => {
    expect(analysis.anchors).toEqual({
      run: 'called',
      diagnostics: 'dev-only-ships',
      ghost: 'missing',
    });
    expect(devOnlyUnitsInCalledFiles(analysis)).toEqual([]);
  });

  it('lists the files in each configured group', () => {
    expect(analysis.groups).toEqual({ gated: ['src/diagnostics.ts', 'src/gate.ts'] });
  });

  it('marks a file loaded but not called when production imports it and uses none of it', () => {
    const quiet = analyse(
      { ...CONFIG, roots: ['src/entry.ts'], anchors: {} },
      writeFixture({ 'src/entry.ts': "import './loaded.js';" }),
    );
    expect(quiet.files.find((row) => row.file === 'src/loaded.ts')?.bucket).toBe(
      'loaded-not-called',
    );
  });
});

function writeFixture(overrides: Record<string, string>): string {
  const root = fixture();
  for (const [path, text] of Object.entries(overrides))
    writeFileSync(join(root, path), `${text}\n`);
  return root;
}

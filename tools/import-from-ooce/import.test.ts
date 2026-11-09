import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  checkCounts,
  oocePath,
  parseManifest,
  runImport,
  type OoceSource,
  type Sha40,
  type TestCount,
} from './import.ts';

const SHA = 'a'.repeat(40) as Sha40;
const FIXTURES = join(import.meta.dirname, 'fixtures', 'ooce');
const SUFFIX = '.fixture';

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(directory, entry.name)) : [join(directory, entry.name)],
  );
}

const fixtureSource: OoceSource = {
  list: (directory) =>
    walk(join(FIXTURES, directory))
      .map((file) => relative(FIXTURES, file).slice(0, -SUFFIX.length))
      .map(oocePath),
  read: (path) => readFileSync(join(FIXTURES, `${path}${SUFFIX}`)),
};

const alpha = {
  name: 'alpha',
  to: 'packages/alpha',
  sources: [{ from: 'packages/libs/alpha' }],
  drop: [{ path: 'internal-notes.txt', reason: 'It names an internal host.' }],
  removeDependencies: ['@source/helpers'],
  edits: [{ path: 'src/index.ts', find: "from '@source/helpers'", replace: '', wholeLine: true }],
  supplied: [{ from: 'tools/import-from-ooce/supplied/helper.ts', to: 'src/helper.ts' }],
};

const gamma = {
  from: 'packages/libs/gamma',
  moves: { 'src/': 'src/gamma/' },
  drop: [
    { path: 'package.json', reason: 'Dependencies merged.' },
    { path: 'tsconfig.json', reason: 'Beta has its own.' },
  ],
};

const beta = {
  name: 'beta',
  to: 'packages/beta',
  sources: [{ from: 'packages/core/beta' }, gamma],
  exports: { './gamma': './dist/gamma.js' },
};

const manifestJson = {
  scope: { from: '@source/', to: '@target/' },
  repository: 'https://example.test/target',
  dropEverywhere: [{ path: 'eslint.config.ts', reason: 'The root config lints packages.' }],
  removeScripts: ['lint'],
  removeDependencies: ['eslint'],
  edits: [
    {
      path: 'vitest.config.ts',
      find: '@source/workspace-config/vitest',
      replace: '../vitest.preset',
    },
  ],
  packages: [alpha, beta],
};

const counts = new Map<string, TestCount>([
  ['packages/libs/alpha', { tests: 3, skipped: 0 }],
  ['packages/core/beta', { tests: 4, skipped: 1 }],
  ['packages/libs/gamma', { tests: 5, skipped: 0 }],
]);

let root: string;

function write(path: string, text: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
}

function read(path: string): string {
  return readFileSync(join(root, path), 'utf8');
}

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(read(path)) as Record<string, unknown>;
}

function run(manifest: unknown = manifestJson, sha: Sha40 = SHA): ReturnType<typeof runImport> {
  write('tools/import-from-ooce/manifest.json', JSON.stringify(manifest));
  return runImport({
    root,
    sha,
    source: fixtureSource,
    ooceRoot: 'ooce',
    countTests: (directory) =>
      counts.get(directory.replace(/^ooce\//, '')) ?? { tests: 0, skipped: 0 },
  });
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'import-test-'));
  write(
    'PROVENANCE.md',
    `# Provenance\n\nPinned OOCE import SHA: \`${SHA}\`\n\n## Entries\n\nNone yet.\n`,
  );
  write('tools/import-from-ooce/supplied/helper.ts', 'export const helper = 1;\n');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('import from OOCE', () => {
  it('renames the scope in names, dependency keys and source text', () => {
    run();
    const alpha = readJson('packages/alpha/package.json');
    expect(alpha['name']).toBe('@target/alpha');
    expect(Object.keys(alpha['dependencies'] as object)).toContain('@target/beta');
    expect(read('packages/alpha/src/index.ts')).toContain("from '@target/beta'");
  });

  it('keeps workspace references to moved packages and drops the removed ones', () => {
    run();
    const dependencies = readJson('packages/alpha/package.json')['dependencies'] as Record<
      string,
      string
    >;
    expect(dependencies['@target/beta']).toBe('workspace:*');
    expect(dependencies).not.toHaveProperty('@source/helpers');
    expect(dependencies).not.toHaveProperty('@target/helpers');
  });

  it('rejects a workspace reference to a package that is not moved', () => {
    const manifest = {
      ...manifestJson,
      packages: [{ ...alpha, removeDependencies: [] }, beta],
    };
    expect(() => run(manifest)).toThrow(/workspace reference to a package that is not moved/);
  });

  it('strips author and contributors and points the repository here', () => {
    run();
    const alpha = readJson('packages/alpha/package.json');
    expect(alpha).not.toHaveProperty('author');
    expect(alpha).not.toHaveProperty('contributors');
    expect(alpha['repository']).toEqual({
      type: 'git',
      url: 'git+https://example.test/target.git',
      directory: 'packages/alpha',
    });
    expect(read('packages/alpha/package.json')).not.toContain('Fixture');
  });

  it('removes scripts and dependencies named in the manifest', () => {
    run();
    const alpha = readJson('packages/alpha/package.json');
    expect(alpha['scripts']).toEqual({ build: 'tsup', test: 'vitest run' });
    expect(alpha['devDependencies']).toEqual({ vitest: '^5.0.0' });
  });

  it('pins direct dependencies to the version the OOCE lockfile resolved', () => {
    run();
    const dependencies = readJson('packages/alpha/package.json')['dependencies'] as Record<
      string,
      string
    >;
    expect(dependencies['left-pad']).toBe('1.3.0');
  });

  it('drops listed files with their reason and rejects an unlisted drop', () => {
    run();
    expect(() => read('packages/alpha/eslint.config.ts')).toThrow();
    expect(() => read('packages/alpha/internal-notes.txt')).toThrow();
    expect(read('PROVENANCE.md')).toContain('It names an internal host.');
    const missing = { path: 'missing.txt', reason: 'Never there.' };
    const manifest = {
      ...manifestJson,
      packages: [{ ...alpha, drop: [...alpha.drop, missing] }, beta],
    };
    expect(() => run(manifest)).toThrow(/drops a file the source lacks: missing.txt/);
  });

  it('refuses a drop without a reason', () => {
    const manifest = {
      ...manifestJson,
      dropEverywhere: [{ path: 'eslint.config.ts', reason: ' ' }],
    };
    expect(() => parseManifest(manifest)).toThrow(/must explain the drop/);
  });

  it('merges a second source into a subdirectory and its dependencies into one package', () => {
    run();
    expect(read('packages/beta/src/gamma/index.ts')).toContain('gamma');
    const beta = readJson('packages/beta/package.json');
    expect(beta['dependencies']).toEqual({ 'mid-pad': '3.0.2', 'right-pad': '2.1.4' });
    expect(beta['exports']).toEqual({ '.': './dist/index.js', './gamma': './dist/gamma.js' });
  });

  it('fails when a merged file is neither moved nor dropped', () => {
    const partial = { ...gamma, drop: [{ path: 'package.json', reason: 'Dependencies merged.' }] };
    const manifest = {
      ...manifestJson,
      packages: [alpha, { ...beta, sources: [{ from: 'packages/core/beta' }, partial] }],
    };
    expect(() => run(manifest)).toThrow(/tsconfig.json is neither moved nor dropped/);
  });

  it('records only byte for byte copies in imported.json', () => {
    run();
    const imported = readJson('tools/import-from-ooce/imported.json') as {
      files: Record<string, string>;
    };
    const stable = Buffer.from('export const stable = 1;\n');
    expect(imported.files['packages/alpha/src/stable.ts']).toBe(
      `sha256:${createHash('sha256').update(stable).digest('hex')}`,
    );
    expect(imported.files).not.toHaveProperty('packages/alpha/package.json');
    expect(imported.files).not.toHaveProperty('packages/alpha/src/index.ts');
    expect(imported.files).not.toHaveProperty('packages/alpha/src/helper.ts');
    expect(Object.keys(readJson('tools/import-from-ooce/imported.json'))).toEqual(['files']);
  });

  it('writes imported.json in canonical form with sorted keys', () => {
    run();
    const raw = read('tools/import-from-ooce/imported.json');
    const paths = Object.keys((JSON.parse(raw) as { files: Record<string, string> }).files);
    expect(paths).toEqual([...paths].sort());
    expect(raw).toBe(`${JSON.stringify(JSON.parse(raw), null, 2)}\n`);
    expect(Object.values((JSON.parse(raw) as { files: Record<string, string> }).files)).toSatisfy(
      (values: string[]) => values.every((v) => /^sha256:[0-9a-f]{64}$/.test(v)),
    );
  });

  it('rewrites a relative link out of the package to the OOCE file at the pinned SHA', () => {
    const manifest = {
      ...manifestJson,
      textRewrites: [{ find: '../../../docs/', replace: 'https://example.test/blob/{sha}/docs/' }],
    };
    run(manifest);
    expect(read('packages/alpha/README.md')).toContain(
      `https://example.test/blob/${SHA}/docs/guide.md`,
    );
  });

  it('lists modified and supplied files in PROVENANCE.md with the source path and SHA', () => {
    run();
    const provenance = read('PROVENANCE.md');
    expect(provenance).toContain(`- Source: \`packages/libs/alpha\` at \`${SHA}\`.`);
    expect(provenance).toContain(
      '- Modified by the tool: `package.json`, `src/index.ts`, `vitest.config.ts`.',
    );
    expect(provenance).toContain('- Supplied from this repository: `src/helper.ts`.');
  });

  it('records the OOCE test counts, summed over merged sources', () => {
    run();
    expect(readJson('tools/import-from-ooce/expected-counts.json')).toEqual({
      sha: SHA,
      packages: {
        '@target/alpha': { tests: 3, skipped: 0 },
        '@target/beta': { tests: 9, skipped: 1 },
      },
    });
  });

  it('changes nothing when run again at the same SHA', () => {
    run();
    const before = walk(root).map((file) => [file, readFileSync(file, 'utf8')]);
    const report = run();
    expect(report).toEqual({ written: [], removed: [] });
    expect(walk(root).map((file) => [file, readFileSync(file, 'utf8')])).toEqual(before);
  });

  it('removes a stale file it owns and leaves build output alone', () => {
    run();
    write('packages/alpha/src/stale.ts', 'export {};\n');
    write('packages/alpha/dist/index.js', 'built\n');
    const report = run();
    expect(report.removed).toEqual(['packages/alpha/src/stale.ts']);
    expect(read('packages/alpha/dist/index.js')).toBe('built\n');
  });

  it('refuses a SHA that differs from the pin', () => {
    expect(() => run(manifestJson, 'b'.repeat(40) as Sha40)).toThrow(/differs from the pin/);
  });

  it('reports a test count that differs from the recorded one', () => {
    run();
    const same = checkCounts(root, (directory) =>
      directory.endsWith('beta') ? { tests: 9, skipped: 1 } : { tests: 3, skipped: 0 },
    );
    expect(same).toHaveLength(2);
    expect(() => checkCounts(root, () => ({ tests: 1, skipped: 0 }))).toThrow(/MISMATCH/);
  });
});

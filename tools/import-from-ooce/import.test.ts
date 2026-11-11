import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  checkCounts,
  countFromVitestRun,
  oocePath,
  openOoce,
  parseManifest,
  resolveSha,
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
  sha: SHA,
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

function run(manifest: unknown = manifestJson): ReturnType<typeof runImport> {
  write('tools/import-from-ooce/manifest.json', JSON.stringify(manifest));
  return runImport({
    root,
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
    const readme = read('packages/alpha/README.md');
    expect(readme).toContain(`(https://example.test/blob/${SHA}/docs/guide.md)`);
    expect(readme).toContain('(../../../../docs/deep.md)');
  });

  it('rewrites each link depth by its own rule, whatever the rule order', () => {
    const manifest = {
      ...manifestJson,
      textRewrites: [
        { find: '../../../docs/', replace: 'https://example.test/blob/{sha}/docs/' },
        { find: '../../../../docs/', replace: 'https://example.test/blob/{sha}/docs/' },
      ],
    };
    run(manifest);
    const readme = read('packages/alpha/README.md');
    expect(readme).toContain(`(https://example.test/blob/${SHA}/docs/guide.md)`);
    expect(readme).toContain(`(https://example.test/blob/${SHA}/docs/deep.md)`);
    expect(readme).not.toContain('../https');
  });

  it('leaves the relative paths in a keepText file alone and says why in PROVENANCE.md', () => {
    const keep = { path: 'README.md', reason: 'The paths are output paths, not links.' };
    const manifest = {
      ...manifestJson,
      textRewrites: [{ find: '../../../docs/', replace: 'https://example.test/blob/{sha}/docs/' }],
      packages: [{ ...alpha, keepText: [keep] }, beta],
    };
    run(manifest);
    expect(read('packages/alpha/README.md')).toContain('(../../../docs/guide.md)');
    expect(read('PROVENANCE.md')).toContain(
      "- Kept OOCE's relative paths in `README.md`. The paths are output paths, not links.",
    );
  });

  it('refuses a keepText path the package does not write', () => {
    const keep = { path: 'missing.md', reason: 'No such file.' };
    expect(() =>
      run({ ...manifestJson, packages: [{ ...alpha, keepText: [keep] }, beta] }),
    ).toThrow(/alpha edits missing.md, which it does not write/);
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

  it('gives the reason for an edit that names one in PROVENANCE.md', () => {
    const edit = { ...alpha.edits[0], reason: 'The helper import is unused.' };
    run({ ...manifestJson, packages: [{ ...alpha, edits: [edit] }, beta] });
    expect(read('PROVENANCE.md')).toContain(
      '- Modified `src/index.ts`. The helper import is unused.',
    );
  });

  it('refuses an edit with an empty reason', () => {
    const edit = { ...alpha.edits[0], reason: ' ' };
    expect(() =>
      parseManifest({ ...manifestJson, packages: [{ ...alpha, edits: [edit] }] }),
    ).toThrow(/reason must explain the edit/);
  });

  it('skips a manifest edit in a package whose file lacks the text', () => {
    const edit = { path: 'src/index.ts', find: "from '@source/beta'", replace: "from './b'" };
    run({ ...manifestJson, edits: [...manifestJson.edits, edit] });
    expect(read('packages/alpha/src/index.ts')).toContain("from './b'");
  });

  it('refuses a manifest edit that matches nothing in any package', () => {
    const edit = { path: 'src/index.ts', find: 'no such text', replace: '' };
    expect(() => run({ ...manifestJson, edits: [...manifestJson.edits, edit] })).toThrow(
      /manifest edit matched nothing in any package: src\/index.ts "no such text"/,
    );
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

  it('refuses a source at another SHA than the pin', () => {
    write('tools/import-from-ooce/manifest.json', JSON.stringify(manifestJson));
    const source = { ...fixtureSource, sha: 'b'.repeat(40) as Sha40 };
    expect(() =>
      runImport({ root, source, ooceRoot: 'ooce', countTests: () => ({ tests: 0, skipped: 0 }) }),
    ).toThrow(/not the pin/);
  });

  it('refuses a SHA that differs from the pin', () => {
    expect(() => resolveSha('b'.repeat(40), SHA)).toThrow(/differs from the pin/);
    expect(resolveSha(undefined, SHA)).toBe(SHA);
    expect(resolveSha(SHA, SHA)).toBe(SHA);
  });

  it('reports a test count that differs from the recorded one', () => {
    run();
    const same = checkCounts(root, (directory) =>
      directory.endsWith('beta') ? { tests: 9, skipped: 1 } : { tests: 3, skipped: 0 },
    );
    expect(same).toHaveLength(2);
    expect(() => checkCounts(root, () => ({ tests: 1, skipped: 0 }))).toThrow(/MISMATCH/);
  });

  it('leaves supplied files out of the counted tests, since OOCE never ran them', () => {
    run();
    const excluded = new Map<string, readonly string[]>();
    checkCounts(root, (directory, { exclude }) => {
      excluded.set(relative(root, directory), exclude);
      return directory.endsWith('beta') ? { tests: 9, skipped: 1 } : { tests: 3, skipped: 0 };
    });
    expect(Object.fromEntries(excluded)).toEqual({
      'packages/alpha': ['src/helper.ts'],
      'packages/beta': [],
    });
  });

  it('drops a whole directory and names it once in PROVENANCE.md with its file count', () => {
    const manifest = {
      ...manifestJson,
      packages: [
        { ...alpha, edits: [], drop: [{ path: 'src/', reason: 'The source moved elsewhere.' }] },
        beta,
      ],
    };
    run(manifest);
    expect(existsSync(join(root, 'packages/alpha/src/index.ts'))).toBe(false);
    expect(existsSync(join(root, 'packages/alpha/src/stable.ts'))).toBe(false);
    expect(existsSync(join(root, 'packages/alpha/src/helper.ts'))).toBe(true);
    expect(read('PROVENANCE.md')).toContain(
      'Dropped `packages/libs/alpha/src/` (2 files). The source moved elsewhere.',
    );
  });

  it('takes only the moved files from a picking source, without its package.json', () => {
    const picked = { from: 'packages/libs/alpha', pick: true, moves: { 'src/': 'src/alpha/' } };
    const manifest = {
      ...manifestJson,
      packages: [alpha, { ...beta, sources: [{ from: 'packages/core/beta' }, gamma, picked] }],
    };
    run(manifest);
    expect(read('packages/beta/src/alpha/stable.ts')).toBe(read('packages/alpha/src/stable.ts'));
    expect(existsSync(join(root, 'packages/beta/README.md'))).toBe(false);
    expect(readJson('packages/beta/package.json')['dependencies']).toEqual({
      'mid-pad': '3.0.2',
      'right-pad': '2.1.4',
    });
  });

  it('refuses a picking first source, which is the package itself', () => {
    const manifest = {
      ...manifestJson,
      packages: [{ ...alpha, sources: [{ from: 'packages/libs/alpha', pick: true }] }, beta],
    };
    expect(() => parseManifest(manifest)).toThrow(/cannot pick/);
  });

  it('counts only the OOCE tests a source brings, less its dropped files and directories', () => {
    const picked = { from: 'packages/libs/alpha', pick: true, moves: { 'src/': 'src/alpha/' } };
    const manifest = {
      ...manifestJson,
      packages: [
        { ...alpha, edits: [], drop: [...alpha.drop, { path: 'src/', reason: 'Moved to beta.' }] },
        { ...beta, sources: [{ from: 'packages/core/beta' }, gamma, picked] },
      ],
    };
    write('tools/import-from-ooce/manifest.json', JSON.stringify(manifest));
    const filters: Record<string, unknown> = {};
    runImport({
      root,
      source: fixtureSource,
      ooceRoot: 'ooce',
      countTests: (directory, filter) => {
        filters[`${directory} ${String(Object.keys(filters).length)}`] = filter;
        return { tests: 1, skipped: 0 };
      },
    });
    expect(Object.values(filters)).toEqual([
      {
        exclude: ['eslint.config.ts', 'internal-notes.txt', 'src/**'],
        include: [],
      },
      { exclude: ['eslint.config.ts'], include: [] },
      { exclude: ['eslint.config.ts', 'package.json', 'tsconfig.json'], include: [] },
      { exclude: ['eslint.config.ts'], include: ['src/'] },
    ]);
  });

  it('removes an export named with null and keeps the rest', () => {
    const manifest = {
      ...manifestJson,
      packages: [alpha, { ...beta, exports: { ...beta.exports, '.': null } }],
    };
    run(manifest);
    expect(readJson('packages/beta/package.json')['exports']).toEqual({
      './gamma': './dist/gamma.js',
    });
  });

  it('adds dependencies the manifest names, held to the workspace rule', () => {
    const added = { devDependencies: { '@target/beta': 'workspace:*' } };
    run({ ...manifestJson, packages: [{ ...alpha, addDependencies: added }, beta] });
    expect(readJson('packages/alpha/package.json')['devDependencies']).toEqual({
      '@target/beta': 'workspace:*',
      vitest: '^5.0.0',
    });
    const stray = { dependencies: { '@source/helpers': 'workspace:^' } };
    expect(() =>
      run({
        ...manifestJson,
        packages: [{ ...alpha, removeDependencies: [], addDependencies: stray }, beta],
      }),
    ).toThrow(/is "workspace:\*" and "workspace:\^"|not moved/);
  });
});

describe('manifest boundary', () => {
  const withPackage = (change: Record<string, unknown>): unknown => ({
    ...manifestJson,
    packages: [{ ...alpha, ...change }, beta],
  });

  it.each([
    '.github/workflows',
    'tools/repo-checks',
    'tools/import-from-ooce',
    'packages/a/b',
    'packages',
    'packages/A.b',
  ])('rejects the destination %s', (to) => {
    expect(() => parseManifest(withPackage({ to }))).toThrow(/packages\/<name> or apps\/<name>/);
  });

  it('accepts an apps destination', () => {
    expect(parseManifest(withPackage({ to: 'apps/alpha' })).packages[0]?.to).toBe('apps/alpha');
  });

  it('rejects a supplied file outside the supplied directory', () => {
    const supplied = [{ from: '.env', to: 'src/env.ts' }];
    expect(() => parseManifest(withPackage({ supplied }))).toThrow(
      /tools\/import-from-ooce\/supplied\//,
    );
  });

  it.each([
    ['the manifest', { ...manifestJson, extra: true }, /manifest has an unknown key: extra/],
    ['a package', withPackage({ edit: [] }), /unknown key: edit/],
    [
      'a source',
      withPackage({ sources: [{ from: 'packages/libs/alpha', move: {} }] }),
      /unknown key: move/,
    ],
    [
      'an edit',
      withPackage({ edits: [{ path: 'a.ts', find: 'a', replace: 'b', whole: true }] }),
      /unknown key: whole/,
    ],
    ['a drop', withPackage({ drop: [{ path: 'a', reason: 'b', why: 'c' }] }), /unknown key: why/],
  ])('rejects an unknown key in %s', (_where, manifest, message) => {
    expect(() => parseManifest(manifest)).toThrow(message);
  });

  it.each([
    ['a package name', { name: '../../evil' }],
    ['an export target', { exports: { './x': 42 } }],
    ['an export path', { exports: { './x': '../outside.js' } }],
    ['an export key', { exports: { x: './dist/x.js' } }],
    [
      'a supplied destination',
      { supplied: [{ from: 'tools/import-from-ooce/supplied/h.ts', to: '../h.ts' }] },
    ],
    ['an edit path', { edits: [{ path: '../a.ts', find: 'a', replace: 'b' }] }],
    ['a drop path', { drop: [{ path: 'a/../../b', reason: 'r' }] }],
    [
      'a move destination',
      { sources: [{ from: 'packages/libs/alpha', moves: { 'src/': '../src/' } }] },
    ],
  ])('rejects a malformed %s', (_what, change) => {
    expect(() => parseManifest(withPackage(change))).toThrow();
  });
});

describe('file system boundary', () => {
  it('refuses to write or delete through a symlinked package directory', () => {
    const outside = mkdtempSync(join(tmpdir(), 'import-outside-'));
    try {
      writeFileSync(join(outside, 'victim.txt'), 'keep\n');
      mkdirSync(join(root, 'packages'), { recursive: true });
      symlinkSync(outside, join(root, 'packages', 'alpha'));
      expect(() => run()).toThrow(/symlink/);
      expect(readdirSync(outside)).toEqual(['victim.txt']);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it('refuses to delete a symlink inside a package', () => {
    run();
    symlinkSync('/nonexistent', join(root, 'packages/alpha/src/link.ts'));
    expect(() => run()).toThrow(/symlink/);
  });
});

describe('OOCE checkout', () => {
  let repo: string;

  function git(...args: string[]): string {
    return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
  }

  function commit(): string {
    git('add', '-A');
    git('-c', 'user.name=t', '-c', 'user.email=t@localhost', 'commit', '-qm', 'c');
    return git('rev-parse', 'HEAD');
  }

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'import-ooce-'));
    git('init', '-q');
    mkdirSync(join(repo, 'packages/x/src'), { recursive: true });
    writeFileSync(join(repo, 'packages/x/src/a.ts'), 'export {};\n');
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it('lists the files of a clean checkout at the SHA', () => {
    const sha = commit() as Sha40;
    expect(openOoce(repo, sha).list(oocePath('packages/x'))).toEqual(['packages/x/src/a.ts']);
  });

  it('refuses a dirty checkout', () => {
    const sha = commit() as Sha40;
    writeFileSync(join(repo, 'packages/x/src/a.ts'), 'export const changed = 1;\n');
    expect(() => openOoce(repo, sha)).toThrow(/uncommitted changes/);
  });

  it('refuses a checkout at another SHA', () => {
    commit();
    expect(() => openOoce(repo, 'c'.repeat(40) as Sha40)).toThrow(/is at/);
  });

  it('refuses a symlink in the source tree', () => {
    symlinkSync('/etc/hosts', join(repo, 'packages/x/src/link.ts'));
    const sha = commit() as Sha40;
    expect(() => openOoce(repo, sha).list(oocePath('packages/x'))).toThrow(
      /packages\/x\/src\/link.ts is a symlink/,
    );
    expect(existsSync(join(repo, 'packages/x/src/link.ts'))).toBe(true);
  });
});

describe('OOCE test counts', () => {
  const report = (fields: Record<string, unknown>): string =>
    JSON.stringify({
      success: true,
      numFailedTestSuites: 0,
      numFailedTests: 0,
      numTotalTests: 5,
      numPendingTests: 1,
      ...fields,
    });

  it('reads the totals from a passing run', () => {
    expect(countFromVitestRun('pkg', { status: 0, output: '', report: report({}) })).toEqual({
      tests: 5,
      skipped: 1,
    });
  });

  it('fails when a test file could not load, even with no failed test', () => {
    const run = {
      status: 1,
      output: 'Failed to resolve import "@oaknational/result"',
      report: report({
        success: false,
        numFailedTestSuites: 3,
        testResults: [
          { name: 'a.test.ts', status: 'failed', message: 'Cannot find package "dist"' },
          { name: 'b.test.ts', status: 'passed', message: '' },
        ],
      }),
    };
    expect(() => countFromVitestRun('pkg', run)).toThrow(
      /3 test files failed[\s\S]*a.test.ts: Cannot find package "dist"[\s\S]*Failed to resolve/,
    );
  });

  it('fails when the run reports no success', () => {
    const run = { status: 0, output: '', report: report({ success: false }) };
    expect(() => countFromVitestRun('pkg', run)).toThrow(/did not pass/);
  });

  it('shows the vitest output when no report was written', () => {
    const run = { status: 1, output: 'Command "vitest" not found', report: undefined };
    expect(() => countFromVitestRun('pkg', run)).toThrow(/wrote no report[\s\S]*not found/);
  });
});

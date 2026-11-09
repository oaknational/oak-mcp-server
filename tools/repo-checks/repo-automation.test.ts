import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import {
  newAdvisories,
  overrideName,
  readHolds,
  rebuildProblems,
  resolvedVersions,
} from './lockfile-rebuild.ts';
import { countAuthored, evaluateSize } from './pr-size.ts';

const root = join(import.meta.dirname, '../..');

describe('CODEOWNERS and Dependabot', () => {
  it('names one owning team on every path', () => {
    const lines = readFileSync(join(root, '.github/CODEOWNERS'), 'utf8')
      .split('\n')
      .filter((line) => line !== '' && !line.startsWith('#'));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^\* @[\w-]+\/[\w-]+$/);
  });

  it('updates both actions and npm', () => {
    const config = parse(readFileSync(join(root, '.github/dependabot.yml'), 'utf8')) as {
      updates: { 'package-ecosystem': string }[];
    };
    expect(config.updates.map((u) => u['package-ecosystem']).sort()).toEqual([
      'github-actions',
      'npm',
    ]);
  });

  it('keeps the npm cooldown equal to pnpm minimumReleaseAge', () => {
    const config = parse(readFileSync(join(root, '.github/dependabot.yml'), 'utf8')) as {
      updates: { 'package-ecosystem': string; cooldown?: { 'default-days': number } }[];
    };
    const workspace = parse(readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8')) as {
      minimumReleaseAge: number;
    };
    const npm = config.updates.find((u) => u['package-ecosystem'] === 'npm');
    expect((npm?.cooldown?.['default-days'] ?? 0) * 1440).toBe(workspace.minimumReleaseAge);
  });

  it('holds back the bumps the toolchain cannot take', () => {
    const config = parse(readFileSync(join(root, '.github/dependabot.yml'), 'utf8')) as {
      updates: {
        'package-ecosystem': string;
        ignore?: { 'dependency-name': string; versions?: string[] }[];
      }[];
    };
    const npm = config.updates.find((u) => u['package-ecosystem'] === 'npm');
    expect(npm?.ignore?.map((i) => i['dependency-name']).sort()).toEqual([
      '@types/node',
      'markdownlint-cli2',
      'typescript',
    ]);
    expect(npm?.ignore?.find((i) => i['dependency-name'] === 'typescript')?.versions).toEqual([
      '>=6.1',
    ]);
  });
});

describe('pr-size bands', () => {
  const proof = '## Size\n\nThe move is tool-generated.\n';

  it('passes up to 10 files', () => {
    expect(evaluateSize(10, '').outcome).toBe('pass');
  });

  it('passes with a note from 11 to 20 files', () => {
    expect(evaluateSize(11, '').outcome).toBe('note');
    expect(evaluateSize(20, '').outcome).toBe('note');
  });

  it('fails over 20 files and names the count', () => {
    const result = evaluateSize(21, '');
    expect(result.outcome).toBe('fail');
    expect(result.message).toContain('21 authored files');
  });

  it('passes over 20 files when the Size section names a proof', () => {
    expect(evaluateSize(21, proof).outcome).toBe('note');
  });

  it('fails over 20 files when the Size section names no proof', () => {
    expect(evaluateSize(21, '## Size\n\nIt is big.\n').outcome).toBe('fail');
  });

  it('leaves out generated, archival and imported files', () => {
    const result = countAuthored({
      changed: ['a.ts', 'gen.ts', 'moved.ts', 'edited-import.ts'],
      importedHashes: { 'moved.ts': 'h1', 'edited-import.ts': 'h2' },
      hashAtHead: (path) => (path === 'moved.ts' ? 'h1' : 'changed'),
      isExcludedByAttributes: (path) => path === 'gen.ts',
    });
    expect(result.authored).toEqual(['a.ts', 'edited-import.ts']);
    expect(result.excluded).toEqual(['gen.ts', 'moved.ts']);
  });
});

describe('pr-size against a real repository', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pr-size-'));
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  const git = (...args: string[]): string => {
    const result = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
    if (result.status !== 0) {
      throw new Error(result.stderr);
    }
    return result.stdout.trim();
  };
  const put = (path: string, content: string): void => {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), content);
  };
  const commit = (message: string): string => {
    git('add', '-A');
    git('-c', 'user.name=t', '-c', 'user.email=fixture', 'commit', '-m', message);
    return git('rev-parse', 'HEAD');
  };
  const sha = (content: string): string => createHash('sha256').update(content).digest('hex');
  const size = (base: string, body = ''): { status: number | null; stdout: string } => {
    const result = spawnSync('node', [join(import.meta.dirname, 'pr-size.ts')], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, BASE_SHA: base, PR_BODY: body, GITHUB_STEP_SUMMARY: '' },
    });
    return { status: result.status, stdout: result.stdout };
  };

  git('init', '-q');
  put('.gitattributes', 'docs/archive/** oak-archival\ngen/** linguist-generated\n');
  put(
    'tools/import-from-ooce/imported.json',
    JSON.stringify({ files: { 'packages/m.ts': sha('m') } }),
  );
  const base = commit('base');

  it('counts only authored files and ignores archival, generated and imported ones', () => {
    for (let i = 0; i < 21; i += 1) {
      put(`src/f${String(i)}.ts`, String(i));
    }
    put('docs/archive/note.md', 'x');
    put('gen/out.ts', 'x');
    put('packages/m.ts', 'm');
    commit('many');
    const result = size(base);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('21 authored files');
    expect(result.stdout).toContain('Excluded as generated, archival or imported: 3');
    expect(size(base, '## Size\n\nA tool-generated move.\n').status).toBe(0);
  });

  it('reads the attributes from the base, so a PR cannot exempt itself', () => {
    put('.gitattributes', 'src/** oak-archival\n');
    commit('self-exempt');
    expect(size(base).status).toBe(1);
  });
});

describe('lockfile-rebuild', () => {
  it('reduces override keys to package names', () => {
    expect(overrideName('@types/node')).toBe('@types/node');
    expect(overrideName('foo@<1.2.3')).toBe('foo');
    expect(overrideName('@scope/foo@<1')).toBe('@scope/foo');
    expect(overrideName('parent>child')).toBe('child');
  });

  it('reads each hold and its bound from backtick bullets only', () => {
    expect(
      readHolds('# Holds\n\n- `typescript` below `6.1`: stay on 6.0\n\nNo holds yet.\n'),
    ).toEqual({ holds: [{ name: 'typescript', below: '6.1' }], errors: [] });
  });

  it('declares a bound for every hold in docs/dependency-holds.md', () => {
    const { holds, errors } = readHolds(
      readFileSync(join(root, 'docs/dependency-holds.md'), 'utf8'),
    );
    expect(errors).toEqual([]);
    expect(holds.map((h) => h.name).sort()).toEqual([
      '@types/node',
      'markdownlint-cli2',
      'typescript',
    ]);
  });

  it('refuses a hold that declares no bound, naming the package', () => {
    expect(readHolds('- `typescript`: stay on 6.0\n').errors).toEqual([
      "The hold on typescript declares no bound. Write it as '- `typescript` below `<version>`: <reason>'.",
    ]);
  });

  it('checks overrides from package.json and pnpm-workspace.yaml exactly', () => {
    const found = rebuildProblems({
      packageJson: JSON.stringify({ pnpm: { overrides: { a: '1' } } }),
      workspaceYaml: 'overrides:\n  b@<2: ">=2"\n',
      holdsMarkdown: '',
      committedLockfile: 'packages:\n  a@1.0.0: {}\n  b@2.0.0: {}\n',
      rebuiltLockfile: 'packages:\n  a@1.0.1: {}\n  b@2.0.1: {}\n',
    });
    expect(found.map((line) => line.split(' ')[0])).toEqual(['a', 'b']);
  });

  const lock = (versions: string[]): string =>
    `lockfileVersion: '9.0'\npackages:\n${versions.map((v) => `  '${v}':\n    resolution: {}\n`).join('')}`;

  it('reads resolved versions from the lockfile packages', () => {
    expect(resolvedVersions(lock(['@s/x@1.0.0', 'y@2.0.0', 'y@2.1.0'])).get('y')).toEqual([
      '2.0.0',
      '2.1.0',
    ]);
    expect(resolvedVersions(lock(['@s/x@1.0.0'])).get('@s/x')).toEqual(['1.0.0']);
  });

  it('reads every document of a multi-document lockfile', () => {
    const two = `${lock(['a@1.0.0'])}---\n${lock(['b@2.0.0'])}`;
    expect([...resolvedVersions(two).keys()].sort()).toEqual(['a', 'b']);
  });

  const problems = (input: {
    overrides?: Record<string, string>;
    holds?: string;
    committed: string[];
    rebuilt: string[];
  }): string[] =>
    rebuildProblems({
      packageJson: JSON.stringify({ pnpm: { overrides: input.overrides ?? {} } }),
      workspaceYaml: '',
      holdsMarkdown: input.holds ?? '',
      committedLockfile: lock(input.committed),
      rebuiltLockfile: lock(input.rebuilt),
    });

  it('passes a held package that rebuilds to a newer version inside its bound', () => {
    expect(
      problems({
        holds: '- `@types/node` below `25`: runtime is Node 24\n- `typescript` below `6.1`: lint\n',
        committed: ['@types/node@24.13.3', 'typescript@6.0.3'],
        rebuilt: ['@types/node@24.19.2', 'typescript@6.0.9'],
      }),
    ).toEqual([]);
  });

  it('fails a held package that rebuilds outside its bound, naming the package', () => {
    const found = problems({
      holds: '- `@types/node` below `25`: runtime\n- `typescript` below `6.1`: lint\n',
      committed: ['@types/node@24.19.2', 'typescript@6.0.3'],
      rebuilt: ['@types/node@25.0.0', 'typescript@6.1.0-rc.1'],
    });
    expect(found).toHaveLength(2);
    expect(found[0]).toContain('@types/node resolves to 25.0.0');
    expect(found[1]).toContain('typescript resolves to 6.1.0-rc.1');
  });

  it('fails a held package when any rebuilt copy leaves the bound', () => {
    const found = problems({
      holds: '- `@types/node` below `25`: runtime\n',
      committed: ['@types/node@24.19.2'],
      rebuilt: ['@types/node@24.19.2', '@types/node@25.1.0'],
    });
    expect(found).toEqual([
      '@types/node resolves to 25.1.0 after a rebuild, outside its hold below 25. Check the range in package.json and the Dependabot ignore.',
    ]);
  });

  it('fails a held package whose rebuilt version is not a release number', () => {
    expect(
      problems({
        holds: '- `x` below `2`: reason\n',
        committed: ['x@1.0.0'],
        rebuilt: ['x@file:../x'],
      })[0],
    ).toContain('x resolves to file:../x');
  });

  it('fails a hold that declares no bound', () => {
    expect(problems({ holds: '- `typescript`: lint\n', committed: [], rebuilt: [] })[0]).toContain(
      'typescript declares no bound',
    );
  });

  it('still fails any drift in an overridden package', () => {
    const found = problems({
      overrides: { y: '^1' },
      committed: ['y@1.0.0', 'z@1.0.0'],
      rebuilt: ['y@1.0.1', 'z@2.0.0'],
    });
    expect(found).toEqual(['y resolves to 1.0.1 after a rebuild, but the lockfile has 1.0.0.']);
  });

  it('reports only advisories that are new after the rebuild', () => {
    expect(newAdvisories(new Set(['1', '2']), new Set(['2', '3']))).toEqual(['3']);
  });
});

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import {
  driftedDependencies,
  holdNames,
  namedDependencies,
  newAdvisories,
  overrideName,
  resolvedVersions,
} from './lockfile-rebuild.ts';
import { countAuthored, evaluateSize, parseImported } from './pr-size.ts';

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

describe('imported.json values', () => {
  const digest = 'ab'.repeat(32);
  const parse = (value: unknown): Record<string, string> =>
    parseImported(JSON.stringify({ files: { 'a.ts': value } }));

  it('reads a sha256: value as its raw digest', () => {
    expect(parse(`sha256:${digest}`)).toEqual({ 'a.ts': digest });
  });

  it.each([
    ['a bare digest', digest],
    ['an uppercase digest', `sha256:${digest.toUpperCase()}`],
    ['a short digest', `sha256:${digest.slice(1)}`],
    ['another algorithm', `sha1:${digest}`],
    ['a number', 1],
  ])('rejects %s', (_label, value) => {
    expect(() => parse(value)).toThrow(/sha256:/);
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
  put('PROVENANCE.md', '# Provenance\n\n## Entries\n\n### `packages/m`\n\n- Source: x.\n');
  put('packages/m/held.ts', 'old');
  put('tools/held.ts', 'old');
  put(
    'tools/import-from-ooce/imported.json',
    JSON.stringify({
      files: {
        'packages/m/held.ts': `sha256:${sha('m')}`,
        'packages/m/later.ts': `sha256:${sha('later')}`,
        'tools/held.ts': `sha256:${sha('m')}`,
      },
    }),
  );
  const base = commit('base');

  it('counts only authored files and ignores archival, generated and imported ones', () => {
    for (let i = 0; i < 21; i += 1) {
      put(`src/f${String(i)}.ts`, String(i));
    }
    put('docs/archive/note.md', 'x');
    put('gen/out.ts', 'x');
    put('packages/m/held.ts', 'm');
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

  it('counts a file whose imported.json entry the base does not hold or PROVENANCE.md does not list', () => {
    git('checkout', '-q', '--detach', base);
    put('packages/m/later.ts', 'later');
    put('tools/held.ts', 'm');
    commit('laundered');
    const result = size(base);
    expect(result.stdout).toContain('2 authored files');
    expect(result.stdout).toContain('Excluded as generated, archival or imported: 0');
  });
});

describe('lockfile-rebuild', () => {
  it('reduces override keys to package names', () => {
    expect(overrideName('@types/node')).toBe('@types/node');
    expect(overrideName('foo@<1.2.3')).toBe('foo');
    expect(overrideName('@scope/foo@<1')).toBe('@scope/foo');
    expect(overrideName('parent>child')).toBe('child');
  });

  it('reads hold names from backtick bullets only', () => {
    expect(holdNames('# Holds\n\n- `typescript`: stay on 6.x\n\nNo holds yet.\n')).toEqual([
      'typescript',
    ]);
  });

  it('collects overrides from package.json and pnpm-workspace.yaml plus the holds', () => {
    const names = namedDependencies({
      packageJson: JSON.stringify({ pnpm: { overrides: { a: '1' } } }),
      workspaceYaml: 'overrides:\n  b@<2: ">=2"\n',
      holdsMarkdown: '- `c`: reason\n',
    });
    expect(names).toEqual(['a', 'b', 'c']);
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

  it('names a dependency that resolves differently after a rebuild', () => {
    const drift = driftedDependencies(
      ['y', 'z'],
      resolvedVersions(lock(['y@1.0.0', 'z@1.0.0'])),
      resolvedVersions(lock(['y@2.0.0', 'z@1.0.0'])),
    );
    expect(drift).toHaveLength(1);
    expect(drift[0]).toContain('y resolves to 2.0.0');
  });

  it('passes when every named dependency resolves the same', () => {
    const same = resolvedVersions(lock(['y@1.0.0']));
    expect(driftedDependencies(['y'], same, same)).toEqual([]);
  });

  it('reports only advisories that are new after the rebuild', () => {
    expect(newAdvisories(new Set(['1', '2']), new Set(['2', '3']))).toEqual(['3']);
  });
});

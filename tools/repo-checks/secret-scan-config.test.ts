import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { resolveScanConfig } from './secret-scan-config.ts';

describe('resolveScanConfig', () => {
  it('uses the gitleaks default rules when the base has no config', () => {
    const config = resolveScanConfig(undefined);
    expect(config.toml).toContain('useDefault = true');
    expect(config.source).toContain('default rules');
  });

  it('uses the base config and names its rule sources', () => {
    const config = resolveScanConfig(
      '[extend]\nuseDefault = true\n\n[[rules]]\nid = "a"\nregex = "x"\n',
    );
    expect(config.toml).toContain('[[rules]]');
    expect(config.source).toContain('.gitleaks.toml at the base');
    expect(config.source).toContain('1 custom rule');
    expect(config.source).toContain('default rules on');
  });

  it.each([
    ['a table', '[extend]\npath = "extra.toml"\n'],
    ['an inline table', 'extend = { path = "extra.toml", useDefault = true }\n'],
    ['a dotted key', 'extend.path = "/abs/extra.toml"\n'],
    [
      'Path beside a custom rule',
      '[extend]\nPath = "extra.toml"\n\n[[rules]]\nid = "a"\nregex = "x"\n',
    ],
    ['PATH with the defaults on', '[extend]\nPATH = "extra.toml"\nuseDefault = true\n'],
    ['a mixed-case dotted key', 'Extend.Path = "extra.toml"\n\n[[rules]]\nid = "a"\nregex = "x"\n'],
    ['an [EXTEND] table', '[EXTEND]\npath = "extra.toml"\nUseDefault = true\n'],
  ])('refuses an [extend] path set as %s', (_form, toml) => {
    expect(() => resolveScanConfig(toml)).toThrow(/\[extend\] path/);
  });

  it.each([
    [
      'a quoted dotted path key',
      '"extend.path" = "extra.toml"\n\n[[rules]]\nid = "a"\nregex = "x"\n',
    ],
    [
      'a quoted dotted useDefault key',
      '"extend.useDefault" = false\n\n[extend]\nuseDefault = true\n',
    ],
    ['a quoted dotted table header', '["Extend.x"]\n\n[extend]\nuseDefault = true\n'],
  ])('refuses an extend key written as %s', (_form, toml) => {
    expect(() => resolveScanConfig(toml)).toThrow(/literal dotted/);
  });

  it.each([
    ['[extend] then an empty [EXTEND]', '[extend]\nuseDefault = true\n\n[EXTEND]\n'],
    ['an empty [EXTEND] then [extend]', '[EXTEND]\n\n[extend]\nuseDefault = true\n'],
  ])('refuses case-colliding extend tables: %s', (_form, toml) => {
    expect(() => resolveScanConfig(toml)).toThrow(/more than one extend table/);
  });

  it.each([
    ['UseDefault', '[extend]\nUseDefault = true\n'],
    ['[EXTEND] with USEDEFAULT', '[EXTEND]\nUSEDEFAULT = true\n'],
  ])('counts %s as the default rules on', (_form, toml) => {
    expect(resolveScanConfig(toml).source).toContain('default rules on');
  });

  it('counts custom rules under any key case', () => {
    expect(resolveScanConfig('[[Rules]]\nid = "a"\nregex = "x"\n').source).toContain(
      '1 custom rule',
    );
  });

  it('treats the defaults as off when any case variant of useDefault is not true', () => {
    expect(() => resolveScanConfig('[extend]\nuseDefault = true\nUseDefault = false\n')).toThrow(
      /zero rules/,
    );
  });

  it.each([
    ['empty', ''],
    ['title only', 'title = "x"\n'],
    ['default rules off', '[extend]\nuseDefault = false\n'],
  ])('refuses a base config with zero rules (%s)', (_form, toml) => {
    expect(() => resolveScanConfig(toml)).toThrow(/zero rules/);
  });

  it('accepts custom rules without the defaults', () => {
    expect(resolveScanConfig('[[rules]]\nid = "a"\nregex = "x"\n').source).toContain(
      'default rules off',
    );
  });

  it('refuses a base config that is not valid TOML', () => {
    expect(() => resolveScanConfig('[extend\n')).toThrow();
  });
});

describe('secret-scan-config against a real repository', () => {
  const dir = mkdtempSync(join(tmpdir(), 'secret-scan-config-'));
  const out = join(dir, '..', `${String(process.pid)}-resolved.toml`);
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
    rmSync(out, { force: true });
  });
  const git = (...args: string[]): string => {
    const result = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
    if (result.status !== 0) {
      throw new Error(result.stderr);
    }
    return result.stdout.trim();
  };
  const commit = (files: Record<string, string>): string => {
    for (const [path, content] of Object.entries(files)) {
      writeFileSync(join(dir, path), content);
    }
    git('add', '-A');
    git(
      '-c',
      'user.name=t',
      '-c',
      'user.email=fixture',
      'commit',
      '-q',
      '--allow-empty',
      '-m',
      'c',
    );
    return git('rev-parse', 'HEAD');
  };
  const run = (base: string): { status: number | null; stdout: string; stderr: string } => {
    rmSync(out, { force: true });
    const result = spawnSync('node', [join(import.meta.dirname, 'secret-scan-config.ts'), out], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, BASE_SHA: base, GITHUB_STEP_SUMMARY: '' },
    });
    return { status: result.status, stdout: result.stdout, stderr: result.stderr };
  };

  git('init', '-q');
  const noConfig = commit({ 'README.md': 'x\n' });
  const strong = commit({ '.gitleaks.toml': '[extend]\nuseDefault = true\n' });
  const weak = commit({ '.gitleaks.toml': '' });
  const head = commit({ '.gitleaks.toml': '[extend]\npath = "extra.toml"\n' });

  it('falls back to the default rules and says so', () => {
    const result = run(noConfig);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('default rules');
    expect(readFileSync(out, 'utf8')).toContain('useDefault = true');
  });

  it('writes the base config, not the working tree one, and names the base commit', () => {
    const result = run(strong);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(strong.slice(0, 12));
    expect(readFileSync(out, 'utf8')).toBe('[extend]\nuseDefault = true\n');
  });

  it('fails when the base config has zero rules', () => {
    expect(run(weak).status).toBe(1);
  });

  it('fails when the base config extends a path', () => {
    const result = run(head);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('[extend] path');
  });

  it('fails when the base commit is missing', () => {
    expect(run('0'.repeat(40)).status).toBe(1);
  });
});

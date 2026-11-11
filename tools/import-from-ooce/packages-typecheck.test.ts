import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = realpathSync(join(import.meta.dirname, '..', '..'));
const packagesDirectory = join(root, 'packages');

function lines(command: string, args: string[], cwd: string): string[] {
  return execFileSync(command, args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\n')
    .filter(Boolean);
}

function typeScriptFiles(directory: string): string[] {
  return lines(
    'git',
    [
      'ls-files',
      '--cached',
      '--others',
      '--exclude-standard',
      '--',
      '*.ts',
      '*.tsx',
      '*.mts',
      '*.cts',
    ],
    directory,
  ).map((file) => join(directory, file));
}

// An asset-only package, such as widget-tokens, has no TypeScript to check.
const names = readdirSync(packagesDirectory, { withFileTypes: true })
  .filter(
    (entry) =>
      entry.isDirectory() && existsSync(join(packagesDirectory, entry.name, 'package.json')),
  )
  .map((entry) => entry.name)
  .filter((name) => typeScriptFiles(join(packagesDirectory, name)).length > 0);

describe.each(names)('packages/%s type-check coverage', (name) => {
  const directory = join(packagesDirectory, name);

  it('runs tsc over its lint tsconfig as its type-check script', () => {
    const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };
    expect(manifest.scripts?.['type-check']).toBe('tsc -p tsconfig.lint.json --noEmit');
  });

  it('type-checks every TypeScript file in the package', () => {
    const checked = new Set(
      lines('pnpm', ['exec', 'tsc', '-p', 'tsconfig.lint.json', '--listFilesOnly'], directory),
    );
    const present = typeScriptFiles(directory);
    expect(present.filter((file) => !checked.has(file))).toEqual([]);
  }, 60_000);
});

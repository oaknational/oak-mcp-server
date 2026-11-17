import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import rootConfig from '../../vitest.config.ts';
import serverConfig from '../../vitest.server.config.ts';

interface Alias {
  find: RegExp;
  replacement: string;
}

const repo = join(import.meta.dirname, '../..');

function aliases(config: { resolve?: { alias?: unknown } }): Alias[] {
  const alias = config.resolve?.alias;
  return Array.isArray(alias) ? (alias as Alias[]) : [];
}

describe.each([
  ['the root test run', rootConfig],
  ['the server test run', serverConfig],
])('%s', (_name, config) => {
  it.each([
    ['@oaknational/result', 'packages/result/src/index.ts'],
    ['@oaknational/logger/node', 'packages/logger/src/node.ts'],
    ['@oaknational/sdk-codegen/api-schema', 'packages/codegen/src/api-schema.ts'],
    [
      '@oaknational/curriculum-sdk/public/mcp-tools.js',
      'packages/curriculum-sdk/src/public/mcp-tools.ts',
    ],
    ['@oaknational/curriculum-sdk/types/es-types', 'packages/curriculum-sdk/src/types/es-types.ts'],
  ])('resolves %s to source, so tests need no build', (specifier, source) => {
    const alias = aliases(config).find(({ find }) => find.test(specifier));
    expect(alias && specifier.replace(alias.find, alias.replacement)).toBe(join(repo, source));
  });

  it('points every alias at a source path that exists', () => {
    const missing = aliases(config)
      .map(({ replacement }) => (replacement.includes('$1') ? dirname(replacement) : replacement))
      .filter((path) => !existsSync(path));
    expect(missing).toEqual([]);
  });
});

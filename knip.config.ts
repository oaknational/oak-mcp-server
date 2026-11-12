import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  workspaces: {
    '.': {
      entry: ['tools/repo-checks/*.ts', 'tools/import-from-ooce/import.ts'],
      ignore: ['tools/import-from-ooce/supplied/*.ts'],
      includeEntryExports: true,
      project: ['*.{ts,mts,cts,mjs}', 'tools/**/*.{ts,tsx,mts,cts}', 'packages/*.ts'],
      ignoreDependencies: ['shellcheck'],
      ignoreBinaries: ['gitleaks'],
    },
    'packages/logger': { entry: ['tests/*.typecheck.ts'] },
    'packages/openapi-zod-client-adapter': { project: ['src/**/*.ts'] },
    'packages/graph-core': { project: ['src/**/*.ts'] },
    'packages/graph-corpus-sdk': {
      entry: [
        'src/index.ts',
        'src/eef-strands/index.ts',
        'src/curriculum/index.ts',
        'src/load.ts',
        'src/store/index.ts',
      ],
      project: ['src/**/*.ts'],
    },
    'packages/curriculum-sdk': {
      entry: [
        'src/*.ts',
        'src/client/**/*.ts',
        'src/config/**/*.ts',
        'src/types/**/*.ts',
        'src/public/**/*.ts',
        'src/mcp/**/*.ts',
        'src/validation/**/*.ts',
      ],
      project: ['src/**/*.ts'],
      ignoreDependencies: ['@zod/core'],
    },
    'packages/search': {
      entry: ['src/**/*.ts', 'code-generation/**/*.ts', 'tests/**/*.ts'],
      project: ['src/**/*.ts', 'code-generation/**/*.ts', 'tests/**/*.ts'],
    },
    'packages/codegen': {
      entry: ['src/**/*.ts', 'code-generation/**/*.ts', 'vocab-gen/**/*.ts'],
      project: ['src/**/*.ts', 'code-generation/**/*.ts', 'vocab-gen/**/*.ts'],
      ignoreDependencies: ['@zod/core'],
    },
  },
};

export default config;

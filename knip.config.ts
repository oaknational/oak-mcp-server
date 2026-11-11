import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  // Vercel calls the default export; OOCE also exports the handler by name.
  ignoreIssues: { 'apps/server/src/server.ts': ['duplicates'] },
  workspaces: {
    '.': {
      entry: ['tools/repo-checks/*.ts', 'tools/import-from-ooce/import.ts'],
      ignore: ['tools/import-from-ooce/supplied/*.ts'],
      includeEntryExports: true,
      project: ['*.{ts,mts,cts,mjs}', 'tools/**/*.{ts,tsx,mts,cts}', 'packages/*.ts'],
      ignoreDependencies: ['shellcheck', '@mcpjam/cli'],
      ignoreBinaries: ['gitleaks'],
    },
    'apps/server': {
      entry: [
        '{src,build-scripts,operations,scripts,conformance,e2e-tests,tests}/**/*.ts',
        'widget/**/*.{ts,tsx}',
        'runtime-only-scripts/*.mjs',
        '*.ts',
      ],
      project: ['**/*.{ts,tsx,mjs}'],
      ignoreDependencies: ['@types/express-serve-static-core', 'prettier'],
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

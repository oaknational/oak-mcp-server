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
  },
};

export default config;

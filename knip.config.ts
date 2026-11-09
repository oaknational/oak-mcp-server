import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  workspaces: {
    '.': {
      entry: ['tools/repo-checks/*.ts'],
      includeEntryExports: true,
      project: ['*.{ts,mts,cts,mjs}', 'tools/**/*.{ts,tsx,mts,cts}'],
      ignoreDependencies: ['shellcheck'],
      ignoreBinaries: ['gitleaks'],
    },
  },
};

export default config;

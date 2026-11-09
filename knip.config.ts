import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  entry: ['tools/repo-checks/*.ts'],
  includeEntryExports: true,
  project: ['*.ts', '*.mjs', 'tools/**/*.ts'],
  ignoreDependencies: ['shellcheck'],
};

export default config;

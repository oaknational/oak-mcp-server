import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  entry: ['tools/repo-checks/*.ts'],
  project: ['*.ts', '*.mjs', 'tools/**/*.ts'],
  ignoreDependencies: ['shellcheck'],
};

export default config;

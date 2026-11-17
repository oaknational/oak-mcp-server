import { configDefaults, defineConfig } from 'vitest/config';

import { sourceAliases } from './vitest.source-aliases.ts';

export default defineConfig({
  resolve: { alias: sourceAliases },
  test: {
    include: ['{tools,packages,apps}/**/*.test.{ts,tsx,mts,cts}'],
    exclude: [...configDefaults.exclude, 'apps/server/**'],
  },
});

import { join } from 'node:path';

import { mergeConfig } from 'vitest/config';

import serverConfig from './apps/server/vitest.config.ts';
import { sourceAliases } from './vitest.source-aliases.ts';

export default mergeConfig(serverConfig, {
  root: join(import.meta.dirname, 'apps/server'),
  resolve: { alias: sourceAliases },
});

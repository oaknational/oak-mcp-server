import { globSync, readFileSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';

import { defineConfig } from 'vitest/config';

interface Manifest {
  name: string;
  exports: Record<string, { types: string }>;
}

const sourceAliases = globSync('packages/*/package.json', { cwd: import.meta.dirname }).flatMap(
  (file) => {
    const manifest = join(import.meta.dirname, file);
    const dir = dirname(manifest);
    const { name, exports } = JSON.parse(readFileSync(manifest, 'utf8')) as Manifest;
    return Object.entries(exports).map(([subpath, { types }]) => ({
      find: new RegExp(`^${posix.join(name, subpath)}$`),
      replacement: join(dir, types.replace(/^\.\/dist\//, 'src/').replace(/\.d\.ts$/, '.ts')),
    }));
  },
);

export default defineConfig({
  resolve: { alias: sourceAliases },
  test: {
    include: ['{tools,packages,apps}/**/*.test.{ts,tsx,mts,cts}'],
  },
});

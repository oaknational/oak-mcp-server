import { globSync, readFileSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';

interface Manifest {
  name: string;
  exports: Record<string, string | { types: string }>;
}

const escape = (text: string): string => text.replace(/[.+?^${}()|[\]\\]/g, '\\$&');

const sourceFileFor = (typesEntry: string): string =>
  typesEntry
    .replace(/^\.\/dist\//, 'src/')
    .replace(/\.d\.ts$/, '.ts')
    .replaceAll('*', '$1');

export const sourceAliases = globSync('packages/*/package.json', {
  cwd: import.meta.dirname,
}).flatMap((file) => {
  const manifest = join(import.meta.dirname, file);
  const { name, exports } = JSON.parse(readFileSync(manifest, 'utf8')) as Manifest;
  return Object.entries(exports).flatMap(([subpath, target]) =>
    typeof target === 'string'
      ? []
      : [
          {
            find: new RegExp(`^${escape(posix.join(name, subpath)).replaceAll('*', '(.+)')}$`),
            replacement: join(dirname(manifest), sourceFileFor(target.types)),
          },
        ],
  );
});

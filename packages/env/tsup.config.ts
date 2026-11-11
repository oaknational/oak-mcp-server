import { createLibConfig } from '../tsup.preset';

export default createLibConfig({
  entry: { index: 'src/index.ts', resolution: 'src/resolution/index.ts' },
  external: ['node:fs', 'node:path'],
});

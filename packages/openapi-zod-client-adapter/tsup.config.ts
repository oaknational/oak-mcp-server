import { createLibConfig } from '../tsup.preset';

export default createLibConfig({
  external: ['fs', 'path', 'node:fs', 'node:path', 'node:module', 'node:url'],
});

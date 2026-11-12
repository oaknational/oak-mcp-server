import { defineConfig, type Options } from 'tsup';

interface LibConfigOverrides {
  readonly external?: string[];
  readonly entry?: Record<string, string> | string[];
}

export function createLibConfig(overrides?: LibConfigOverrides): ReturnType<typeof defineConfig> {
  const options: Options = {
    format: ['esm'],
    sourcemap: true,
    clean: true,
    minify: false,
    treeshake: true,
    splitting: false,
    dts: false,
    tsconfig: './tsconfig.build.json',
    outDir: 'dist',
    entry: overrides?.entry ?? ['src/index.ts'],
    target: 'es2022',
    bundle: true,
    ...(overrides?.external && { external: overrides.external }),
  };
  return defineConfig(options);
}

interface SdkConfigOverrides {
  readonly external?: string[];
  readonly target?: string;
}

export function createSdkConfig(
  entries: string[] | Record<string, string>,
  overrides?: SdkConfigOverrides,
): ReturnType<typeof defineConfig> {
  return defineConfig({
    format: ['esm'],
    sourcemap: true,
    clean: true,
    minify: false,
    treeshake: true,
    splitting: false,
    dts: false,
    tsconfig: './tsconfig.build.json',
    outDir: 'dist',
    entry: entries,
    target: overrides?.target ?? 'node22',
    bundle: false,
    platform: 'neutral',
    ...(overrides?.external && { external: overrides.external }),
    esbuildOptions(options) {
      options.plugins = options.plugins ?? [];
      options.plugins.push({
        name: 'ensure-js-extensions',
        setup(build) {
          build.onResolve({ filter: /^\./ }, (args) => {
            if (args.path.endsWith('.js') || args.path.endsWith('.json')) {
              return null;
            }
            return { path: `${args.path}.js` };
          });
        },
      });
    },
  });
}

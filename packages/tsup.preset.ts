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

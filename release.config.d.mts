import type { RELEASE_RULES } from './tools/repo-checks/release.ts';

declare const config: {
  readonly branches: readonly string[];
  readonly tagFormat: string;
  readonly releaseRules: typeof RELEASE_RULES;
  readonly parserOpts: Readonly<Record<string, unknown>>;
  readonly plugins: readonly unknown[];
};

export default config;

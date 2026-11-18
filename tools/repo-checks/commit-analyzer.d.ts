declare module '@semantic-release/commit-analyzer' {
  export function analyzeCommits(
    pluginConfig: object,
    context: {
      readonly commits: readonly { readonly message: string; readonly hash: string }[];
      readonly logger: { readonly log: (...args: unknown[]) => void };
      readonly cwd: string;
    },
  ): Promise<string | null>;
}

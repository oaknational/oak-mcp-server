/**
 * Resolve the OpenAPI schema source for code generation.
 *
 * @remarks
 * The committed schema cache is the source for **every** build environment —
 * local, CI, and deployment builds alike — so codegen is hermetic and
 * deterministic: no network, reproducible from the committed cache. Upstream
 * schema updates are expected and regular; adopting one is a deliberate act
 * (the root `sdk-codegen:refresh` script), never an ambient build
 * side-effect, and the CI schema-drift check surfaces when the committed
 * cache is behind the upstream schema. Refreshing from the live upstream
 * spec is **opt-in**:
 *
 * - the `--online` CLI flag, or
 * - `SDK_CODEGEN_MODE=online`.
 *
 * `VERCEL` is deliberately **not** a trigger (MCP-130): deployment builds
 * regenerating against the live schema on cache miss coupled unrelated PR
 * builds to in-flight upstream updates. The former `--ci` /
 * `SDK_CODEGEN_MODE=ci` sentinels (which meant "read the cache") are
 * retired: cached is the default, so they are inert.
 */
export interface SchemaSourceInput {
  /** CLI arguments passed to the codegen script (typically `process.argv.slice(2)`). */
  readonly args: readonly string[];
  /** Value of `SDK_CODEGEN_MODE`, or `undefined` when unset. */
  readonly sdkCodegenMode: string | undefined;
}

/** The resolved schema source: the committed cache, or a live upstream fetch. */
export type SchemaSource = 'cached' | 'online';

/**
 * Decide whether codegen reads the committed cache or fetches the live upstream
 * schema. Cached is the default; online requires an explicit opt-in.
 */
export function resolveSchemaSource(input: SchemaSourceInput): SchemaSource {
  const online = input.args.includes('--online') || input.sdkCodegenMode === 'online';
  return online ? 'online' : 'cached';
}

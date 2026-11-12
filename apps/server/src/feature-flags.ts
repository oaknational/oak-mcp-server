/**
 * Feature-flag resolution engine.
 *
 * The env layer (`env.ts`) validates each flag to `'true' | 'false' | undefined`.
 * These pure functions apply the flag's *posture* — how an unset value resolves.
 *
 * Registration-surface membership is NOT a flag concern: what the app serves
 * is governed by the declarative served-surface definition
 * (`served-surface/served-surface.ts`, mcp-101). Flags remain for runtime
 * behaviour switches only (e.g. stub tools, auth bypass in development).
 */

/** Opt-in posture: enabled only on an explicit `'true'` (default OFF). */
export function resolveOptInFlag(value: string | undefined): boolean {
  return value === 'true';
}

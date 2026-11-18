/**
 * Build-time gate on the full deployment environment.
 *
 * @remarks
 * MCP-691: a malformed `POSTHOG_PSEUDONYM_KEYRING` built and deployed
 * cleanly on preview, then threw on every invocation at runtime — with
 * nothing captured in Sentry, because the observability config itself was
 * part of the broken deployment. The build had every input it needed to
 * reject this and did not.
 *
 * `loadRuntimeConfig` is the one function that resolves and validates the
 * deployment environment — `HttpEnvSchema` plus the deep PostHog-keyring
 * parse in `resolveProductAnalyticsConfig` — for the runtime boundary. This
 * gate calls that SAME function at build time, so there is one source of
 * truth for what a valid deployment environment looks like, not a second
 * schema that can drift from it. Runtime fail-fast behaviour is unchanged;
 * this adds an earlier gate in front of it.
 *
 * Scoped to actual Vercel builds via `VERCEL=1` (the system env var Vercel
 * sets during both build and runtime, and the same signal
 * `@oaknational/env/resolution` already reads to decide whether to add
 * Vercel-specific guidance to a validation error) so `pnpm build` keeps
 * working locally and in CI, where no deployment secret is configured.
 *
 * Whether this closes the incident's failure mode completely, or only
 * narrows the window, turns on Vercel's own deployment model: per Vercel's
 * documented environment-variable behaviour, "changes you make to
 * environment variables are not applied to previous deployments, they
 * only apply to new deployments" (vercel.com/docs/environment-variables),
 * and its troubleshooting table is explicit that "the running deployment
 * keeps the values it was built with." A preview promoted to production
 * goes through "a complete rebuild"; a staged production build is already
 * built with production env vars before it can be promoted (no rebuild at
 * promotion time); Instant Rollback reuses a deployment that has already
 * served production traffic — and so already passed this gate when it was
 * built — without rebuilding
 * (vercel.com/docs/deployments/promoting-a-deployment). Every path that
 * can change what a deployed function reads passes through a build this
 * gate can see first. The one residual gap is rolling back to a
 * deployment built before this gate existed, which is a pre-existing
 * redeploy-history risk, not a bypass of the gate itself.
 *
 * @packageDocumentation
 */

import { loadRuntimeConfig } from '../src/runtime-config.js';
import type { LoadRuntimeConfigOptions } from '../src/runtime-config-support.js';

/**
 * Whether this build is running on Vercel (build or runtime), per the
 * `VERCEL` system environment variable Vercel sets to the literal string
 * `'1'`.
 *
 * @remarks
 * Local `pnpm build` runs and this repo's CI `pnpm build` step never set
 * `VERCEL`, so neither is affected by the gate this flag controls.
 */
export function isVercelBuild(processEnv: Readonly<Record<string, string | undefined>>): boolean {
  return processEnv.VERCEL === '1';
}

/**
 * Validates the deployment environment against `HttpEnvSchema` and the
 * PostHog product-analytics bootstrap, via `loadRuntimeConfig` — the exact
 * function the runtime boundary uses. No-ops when this is not a Vercel
 * build.
 *
 * @throws Error naming the failing key(s) and the violated rule, exactly
 * as `loadRuntimeConfig`'s own error reports them. Never includes a
 * supplied env value: neither `HttpEnvSchema`'s validation messages nor
 * `resolveProductAnalyticsConfig`'s content-free failures echo one, and
 * this function adds no value of its own to the message.
 */
export function assertDeploymentEnvValid(options: LoadRuntimeConfigOptions): void {
  if (!isVercelBuild(options.processEnv)) {
    return;
  }

  const result = loadRuntimeConfig(options);

  if (!result.ok) {
    throw new Error(
      `[deployment-env-gate] Deployment environment failed validation before build: ${result.error.message}`,
    );
  }
}

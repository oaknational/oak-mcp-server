import type { z } from 'zod';
import { RELEASE_ENVIRONMENTS } from '@oaknational/build-metadata';

/**
 * Clerk production-promotion guards (MCP-143 Stage 1).
 *
 * The env schema composes these refinements the same way it composes the
 * product-analytics rules from `env-product-analytics.ts`: the field
 * shape stays in the base schema, the conditional production rules live
 * here, and `env.ts` calls them from its `superRefine`. Keeping the
 * Clerk-specific safety rules in one module keeps `env.ts` an index of
 * the boundary rather than the home of every rule body.
 */

interface ClerkKeyLocalityData {
  readonly CLERK_PUBLISHABLE_KEY?: string;
  readonly CLERK_SECRET_KEY?: string;
  readonly VERCEL_ENV?: string;
}

/**
 * Production key-locality guard (MCP-143 Guard 1a).
 *
 * Clerk key prefixes are canonical: `pk_test_`/`pk_live_`,
 * `sk_test_`/`sk_live_`. In production, keys MUST be live-realm keys. This is
 * a positive ALLOWLIST — a production key must start with the live prefix —
 * not a denylist of the known test prefix. A `pk_test_`/`sk_test_` key points
 * the app at the Clerk *development* realm (the confirmed live gap: prod
 * `/oauth/authorize` 307-ing to `native-hippo-15.clerk.accounts.dev`), and a
 * malformed, staging, or otherwise unknown-prefix key is equally wrong for
 * production; both fail closed. Reject at startup so any non-live key on
 * production is a hard boot failure rather than a silent cross-realm auth
 * path. An absent key falls to the "required when auth enabled" check, so it
 * is not double-reported here. Issues land on the respective key path.
 */
export function refineClerkKeyLocality(data: ClerkKeyLocalityData, ctx: z.RefinementCtx): void {
  if (data.VERCEL_ENV !== RELEASE_ENVIRONMENTS.production) {
    return;
  }

  if (data.CLERK_PUBLISHABLE_KEY && !data.CLERK_PUBLISHABLE_KEY.startsWith('pk_live_')) {
    ctx.addIssue({
      code: 'custom',
      path: ['CLERK_PUBLISHABLE_KEY'],
      message:
        'CLERK_PUBLISHABLE_KEY must be a live key (pk_live_) in production. ' +
        'A non-live key (pk_test_ or any other prefix) points away from the ' +
        'Clerk production realm.',
    });
  }

  if (data.CLERK_SECRET_KEY && !data.CLERK_SECRET_KEY.startsWith('sk_live_')) {
    ctx.addIssue({
      code: 'custom',
      path: ['CLERK_SECRET_KEY'],
      message:
        'CLERK_SECRET_KEY must be a live key (sk_live_) in production. ' +
        'A non-live key (sk_test_ or any other prefix) points away from the ' +
        'Clerk production realm.',
    });
  }
}

/**
 * Sentry scope primitives — shared types used by both the core config
 * contract (`types.ts`) and the fixture capture types (`types-fixture.ts`).
 *
 * @remarks Extracted to avoid a circular import cycle between `types.ts`
 * and `types-fixture.ts`. Both files import scope primitives from here;
 * this file imports from neither.
 */

/** Primitive value types safe for Sentry scope and metric payloads. */
export type SentryPrimitiveValue = string | number | boolean | undefined;

/**
 * Structured context payload for Sentry scope attachment.
 *
 * @remarks Open-keyed but value-narrowed. The key space is unbounded
 * (user-defined context names) but values are constrained to safe primitives.
 */
export type SentryContextPayload = Readonly<Record<string, SentryPrimitiveValue>>;

/**
 * User identity attached to the Sentry scope.
 *
 * @remarks Narrower than Sentry's upstream `User` which has `[key: string]: unknown`.
 * Constrained to `id` (required, string-only) and optional `username`.
 * No PII fields (email, ip_address) to enforce `sendDefaultPii: false`.
 *
 * A `type` alias, not an `interface`: TypeScript only synthesises an implicit
 * index signature for type aliases, never for interfaces (interfaces stay
 * open to declaration merging). Sentry's own `User` interface's index
 * signature moved from `[key: string]: any` to `[key: string]: unknown` in
 * v11, and `any` no longer short-circuits the compatibility check — an
 * `interface` here would need its own matching index signature to keep
 * flowing into `setUser`.
 */
export type SentryUser = {
  readonly id: string;
  readonly username?: string;
};

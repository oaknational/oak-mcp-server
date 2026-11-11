/**
 * Type guards for narrowing response payloads during response augmentation.
 *
 * Path/content-type classification lives in
 * `response-augmentation-path-classification.ts`; slug and generic-ID
 * extraction lives in `response-augmentation-slug-extraction.ts`. This file
 * holds only the foundational object-narrowing guards both of those and
 * `response-augmentation.ts` build on.
 */

/**
 * A non-null object response that can be narrowed via property checks.
 * This type is used internally by type guards to narrow unknown values
 * to something compatible with the `in` operator.
 */
interface ObjectResponse {
  readonly [Symbol.toStringTag]?: string;
}

/**
 * Type guard that narrows unknown to a non-null object.
 * Used to enable the `in` operator for property checking.
 */
export function isNonNullObject(value: unknown): value is ObjectResponse {
  return typeof value === 'object' && value !== null;
}

/**
 * A payload whose own enumerable fields are meaningful to merge: a
 * non-null object that is not an array. Arrays are excluded — spreading
 * an array yields numeric-index keys, never intended response fields —
 * so array payloads fall through to the oakUrl-fields-only branch like
 * every other non-object.
 */
export function isMergeablePayload(value: unknown): value is ObjectResponse {
  return isNonNullObject(value) && !Array.isArray(value);
}

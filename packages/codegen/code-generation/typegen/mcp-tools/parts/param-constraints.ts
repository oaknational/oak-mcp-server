/**
 * Detection of OpenAPI parameter constraints the MCP tool generator cannot
 * express in the input surfaces it emits.
 *
 * The generator translates a parameter's schema into three surfaces — the
 * `tools/list` JSON Schema, the nested SDK-invoke Zod schema, and the flat
 * MCP Zod schema. A keyword outside the translated set used to vanish
 * without a trace, which is how `limit`'s upstream `maximum: 300` came to be
 * advertised as unbounded: `invoke` validates against the tool's own Zod
 * schema before the generated request validator is ever consulted, so the
 * looser schema is the only one that runs on the MCP path.
 *
 * Generation fails on an unpropagated keyword rather than shipping that gap.
 * A build-time failure forces a deliberate decision when upstream tightens a
 * parameter; a silent drop produces a contract the API does not honour.
 */

import type { SchemaObject } from 'openapi3-ts/oas31';

/**
 * Validation keywords the generator propagates into the emitted surfaces.
 * Listed for documentation and for the symmetry check in the unit tests —
 * the propagation itself lives in the metadata extractor and the emitters.
 */
export const PROPAGATED_VALIDATION_KEYWORDS = ['enum', 'maximum', 'minimum'] as const;

/**
 * Validation keywords the generator does not propagate. Presence of any of
 * these on a parameter schema fails generation.
 *
 * Annotation keywords (`format`, `title`, `description`, `example`,
 * `deprecated`, `default`) are deliberately absent: they describe a value
 * without changing which values are accepted, so dropping one narrows
 * guidance, never validation.
 */
export const UNPROPAGATED_VALIDATION_KEYWORDS = [
  'const',
  'exclusiveMaximum',
  'exclusiveMinimum',
  'maxItems',
  'maxLength',
  'minItems',
  'minLength',
  'multipleOf',
  'pattern',
  'uniqueItems',
] as const;

/**
 * List the unpropagated validation keywords present on a parameter schema.
 *
 * @param schema - The parameter's OpenAPI schema object
 * @returns The offending keyword names, in the declared (alphabetical) order
 */
export function findUnpropagatedValidationKeywords(schema: object): readonly string[] {
  return UNPROPAGATED_VALIDATION_KEYWORDS.filter((keyword) => keyword in schema);
}

/**
 * Read an inclusive numeric bound off a parameter schema.
 *
 * @param schema - The parameter's OpenAPI schema object, if it has one
 * @param keyword - Which bound to read
 * @returns The bound, or undefined when absent or not a number
 */
export function readNumericBound(
  schema: SchemaObject | undefined,
  keyword: 'minimum' | 'maximum',
): number | undefined {
  if (!schema || !(keyword in schema)) {
    return undefined;
  }
  const value: unknown = schema[keyword];
  return typeof value === 'number' ? value : undefined;
}

/**
 * Refuse to emit input surfaces that silently drop an upstream constraint.
 *
 * @param paramName - The OpenAPI parameter name, for the failure message
 * @param schema - The parameter's OpenAPI schema object, if it has one
 * @throws TypeError naming the parameter and the offending keywords
 */
export function assertConstraintsArePropagated(
  paramName: string,
  schema: SchemaObject | undefined,
): void {
  if (!schema) {
    return;
  }
  const unpropagated = findUnpropagatedValidationKeywords(schema);
  if (unpropagated.length === 0) {
    return;
  }
  throw new TypeError(
    `Parameter '${paramName}' declares validation keyword(s) the MCP tool generator does not ` +
      `propagate: ${unpropagated.join(', ')}. Emitting the tool schemas anyway would advertise a ` +
      `looser contract than the API enforces. Add propagation for the keyword(s) in ` +
      `build-json-schema-property.ts and build-zod-type.ts, then move them to ` +
      `PROPAGATED_VALIDATION_KEYWORDS below.`,
  );
}

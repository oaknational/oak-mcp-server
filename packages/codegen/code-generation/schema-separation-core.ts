/**
 * Schema Separation Core Functions
 *
 * Pure functions for separating the original API schema from the SDK-enhanced schema.
 * This ensures we preserve the canonical API schema as the source of truth while
 * creating our own SDK-specific version with additional fields.
 */

import type { OpenAPIObject } from 'openapi3-ts/oas31';
import { assertSchemaHasComponentsSchemas } from './schema-validator.js';
import { decorateOakUrls } from './schema-separation-decorators.js';
import { add404ResponsesWhereExpected } from './schema-enhancement-404.js';
import { applyDeferredPaths } from './apply-deferred-paths.js';

export interface SeparatedSchema {
  readonly original: OpenAPIObject;
  readonly sdk: OpenAPIObject;
}

export function createOpenCurriculumSchema(validated: OpenAPIObject): SeparatedSchema {
  assertSchemaHasComponentsSchemas(validated);
  const original = structuredClone(validated);
  const decorated = decorateOakUrls(validated);
  // Deferral applies to the sdk member only: `original` stays verbatim upstream truth
  // (the emitted api-schema-original.json is written from it alone), while every
  // generator consumes `sdk`. See excluded-paths.ts for scope and lifetime.
  const sdk = applyDeferredPaths(add404ResponsesWhereExpected(decorated));
  return { original, sdk };
}

/** Shared parameter metadata definitions for MCP tool emitters */

import type { PrimitiveType } from './param-utils.js';

export interface ParamMetadata {
  readonly typePrimitive: PrimitiveType;
  readonly valueConstraint: boolean;
  readonly required: boolean;
  readonly allowedValues?: readonly unknown[];
  readonly description?: string;
  readonly default?: unknown;
  /** Example value from OpenAPI schema for AI agent guidance */
  readonly example?: unknown;
  /**
   * Inclusive lower bound from the OpenAPI schema. Propagated into every
   * emitted input surface so MCP callers are held to the same contract the
   * upstream API enforces.
   */
  readonly minimum?: number;
  /** Inclusive upper bound from the OpenAPI schema. */
  readonly maximum?: number;
}

export type ParamMetadataMap = Record<string, ParamMetadata>;

export function createMutableParamMetadata(metadata: ParamMetadata): ParamMetadata {
  return {
    typePrimitive: metadata.typePrimitive,
    valueConstraint: metadata.valueConstraint,
    required: metadata.required,
    allowedValues: metadata.allowedValues,
    description: metadata.description,
    default: metadata.default,
    example: metadata.example,
    minimum: metadata.minimum,
    maximum: metadata.maximum,
  };
}

/**
 * Normalise an OpenAPI parameter name for MCP-facing schemas.
 *
 * Strips the `Slug` suffix so AI agents see cleaner parameter names
 * (e.g. `threadSlug` becomes `thread`). The canonical OpenAPI name is
 * preserved in internal SDK types and the flat-to-nested transform
 * maps back from the normalised name to the canonical one.
 */
export function normaliseParamName(openApiName: string): string {
  return openApiName.endsWith('Slug') ? openApiName.slice(0, -4) : openApiName;
}

import type { ParamMetadata } from './param-metadata.js';
import type {
  JsonSchemaProperty,
  JsonSchemaPropertyString,
  JsonSchemaPropertyNumber,
  JsonSchemaPropertyBoolean,
  JsonSchemaPropertyArray,
} from './json-schema-types.js';

function buildCommon(meta: ParamMetadata): {
  readonly description?: string;
  readonly default?: unknown;
  readonly examples?: readonly unknown[];
} {
  const out: { description?: string; default?: unknown; examples?: unknown[] } = {};
  if (meta.description !== undefined) {
    out.description = meta.description;
  }
  if (meta.default !== undefined) {
    out.default = meta.default;
  }
  if (meta.example !== undefined) {
    out.examples = [meta.example];
  }
  return out;
}

function buildStringProperty(meta: ParamMetadata): JsonSchemaPropertyString {
  const common = buildCommon(meta);
  const base: JsonSchemaPropertyString = { type: 'string', ...common };
  if (meta.valueConstraint && Array.isArray(meta.allowedValues)) {
    return { ...base, enum: meta.allowedValues };
  }
  return base;
}

/**
 * Numeric range bounds carried through from the upstream OpenAPI schema.
 *
 * These reach the MCP client through `tools/list`, so omitting them
 * advertises a looser contract than the API honours.
 */
function buildNumericBounds(meta: ParamMetadata): {
  readonly minimum?: number;
  readonly maximum?: number;
} {
  const out: { minimum?: number; maximum?: number } = {};
  if (meta.minimum !== undefined) {
    out.minimum = meta.minimum;
  }
  if (meta.maximum !== undefined) {
    out.maximum = meta.maximum;
  }
  return out;
}

function buildNumberProperty(meta: ParamMetadata): JsonSchemaPropertyNumber {
  const common = buildCommon(meta);
  const bounds = buildNumericBounds(meta);
  const base: JsonSchemaPropertyNumber = { type: 'number', ...common, ...bounds };
  if (meta.valueConstraint && Array.isArray(meta.allowedValues)) {
    return { ...base, enum: meta.allowedValues };
  }
  return base;
}

function buildBooleanProperty(meta: ParamMetadata): JsonSchemaPropertyBoolean {
  const common = buildCommon(meta);
  const base: JsonSchemaPropertyBoolean = { type: 'boolean', ...common };
  if (meta.valueConstraint && Array.isArray(meta.allowedValues)) {
    return { ...base, enum: meta.allowedValues };
  }
  return base;
}

function buildArrayProperty(
  item: 'string' | 'number' | 'boolean',
  meta: ParamMetadata,
): JsonSchemaPropertyArray<'string' | 'number' | 'boolean'> {
  const common = buildCommon(meta);
  return { type: 'array', items: { type: item }, ...common };
}

export function jsonSchemaFromPrimitive(meta: ParamMetadata): JsonSchemaProperty {
  const t = meta.typePrimitive;
  if (t === 'string') {
    return buildStringProperty(meta);
  }
  if (t === 'number') {
    return buildNumberProperty(meta);
  }
  if (t === 'boolean') {
    return buildBooleanProperty(meta);
  }
  if (t === 'string[]') {
    return buildArrayProperty('string', meta);
  }
  if (t === 'number[]') {
    return buildArrayProperty('number', meta);
  }
  return buildArrayProperty('boolean', meta);
}

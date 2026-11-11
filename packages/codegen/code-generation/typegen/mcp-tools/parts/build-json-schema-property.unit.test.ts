import { describe, it, expect } from 'vitest';
import { jsonSchemaFromPrimitive } from './build-json-schema-property.js';
import type { ParamMetadata } from './param-metadata.js';

/**
 * Unit tests for jsonSchemaFromPrimitive.
 *
 * The JSON Schema emitted here is what an MCP client sees in `tools/list`,
 * so any validation keyword the upstream OpenAPI schema declares must
 * survive the trip. A dropped `maximum` advertises a looser contract than
 * the API honours.
 */
describe('jsonSchemaFromPrimitive', () => {
  describe('numeric range constraints', () => {
    it('carries maximum onto a number property', () => {
      const meta: ParamMetadata = {
        typePrimitive: 'number',
        valueConstraint: false,
        required: false,
        maximum: 300,
      };
      expect(jsonSchemaFromPrimitive(meta)).toEqual({ type: 'number', maximum: 300 });
    });

    it('carries minimum onto a number property', () => {
      const meta: ParamMetadata = {
        typePrimitive: 'number',
        valueConstraint: false,
        required: false,
        minimum: 1,
      };
      expect(jsonSchemaFromPrimitive(meta)).toEqual({ type: 'number', minimum: 1 });
    });

    it('carries both bounds alongside description, default and examples', () => {
      const meta: ParamMetadata = {
        typePrimitive: 'number',
        valueConstraint: false,
        required: false,
        description: 'Limit the number of keywords',
        default: 20,
        example: 20,
        minimum: 1,
        maximum: 300,
      };
      expect(jsonSchemaFromPrimitive(meta)).toEqual({
        type: 'number',
        description: 'Limit the number of keywords',
        default: 20,
        examples: [20],
        minimum: 1,
        maximum: 300,
      });
    });

    it('omits bounds entirely when the upstream schema declares none', () => {
      const meta: ParamMetadata = {
        typePrimitive: 'number',
        valueConstraint: false,
        required: false,
      };
      expect(jsonSchemaFromPrimitive(meta)).toEqual({ type: 'number' });
    });

    it('keeps bounds alongside an enum constraint', () => {
      const meta: ParamMetadata = {
        typePrimitive: 'number',
        valueConstraint: true,
        required: false,
        allowedValues: [10, 20, 30],
        maximum: 30,
      };
      expect(jsonSchemaFromPrimitive(meta)).toEqual({
        type: 'number',
        enum: [10, 20, 30],
        maximum: 30,
      });
    });

    it('does not put numeric bounds on a string property', () => {
      const meta: ParamMetadata = {
        typePrimitive: 'string',
        valueConstraint: false,
        required: false,
        maximum: 300,
      };
      expect(jsonSchemaFromPrimitive(meta)).toEqual({ type: 'string' });
    });
  });
});

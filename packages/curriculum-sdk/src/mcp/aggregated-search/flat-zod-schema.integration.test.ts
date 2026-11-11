/**
 * Integration tests for the search tool's flat Zod schema.
 *
 * Phase 2 of the off-the-shelf MCP SDK adoption plan: aggregated tools
 * need `inputSchema` with `.describe()` and `.meta({ examples })` so
 * the MCP SDK's native `z.toJSONSchema()` conversion produces correct
 * JSON Schema with examples — no shim needed.
 *
 * These tests exercise the full Zod 4 globalRegistry path:
 * `.meta()` → `z.toJSONSchema()` → `examples` in JSON Schema output.
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { SEARCH_INPUT_SCHEMA } from './flat-zod-schema.js';
import { wireProperties } from '../test-helpers/advertised-examples.js';

describe('search inputSchema round-trip', () => {
  it('exports a defined inputSchema', () => {
    expect(SEARCH_INPUT_SCHEMA).toBeDefined();
  });

  it('z.toJSONSchema() carries authored field metadata to the wire unchanged', () => {
    // Behaviour, never config (owner ruling 2026-07-28): WHICH fields
    // advertise examples is an authoring choice; the invariant is the
    // transform — whatever `.meta({ examples })` is authored reaches the
    // wire JSON Schema unchanged, including through union and enum
    // wrappers, and fields with no metadata stay bare on both sides. The
    // example VALUES' truth against deployed data is a live-probe concern.
    const properties = wireProperties(SEARCH_INPUT_SCHEMA);

    const advertised = Object.entries(SEARCH_INPUT_SCHEMA).filter(
      ([, schema]) => schema.meta()?.examples !== undefined,
    );
    expect(advertised, 'at least one field must advertise examples').not.toHaveLength(0);
    for (const [field, schema] of advertised) {
      expect(schema.meta()?.examples, `${field} advertises at least one example`).not.toHaveLength(
        0,
      );
    }

    for (const [field, schema] of Object.entries(SEARCH_INPUT_SCHEMA)) {
      expect(properties[field]?.examples, `${field}: metadata in, metadata on the wire`).toEqual(
        schema.meta()?.examples,
      );
    }
  });

  it('z.toJSONSchema() produces descriptions on all 16 fields', () => {
    const jsonSchema = z.toJSONSchema(z.object(SEARCH_INPUT_SCHEMA));

    expect(jsonSchema).toHaveProperty('properties.query.description');
    expect(jsonSchema).toHaveProperty('properties.scope.description');
    expect(jsonSchema).toHaveProperty('properties.subject.description');
    expect(jsonSchema).toHaveProperty('properties.keyStage.description');
    expect(jsonSchema).toHaveProperty('properties.size.description');
    expect(jsonSchema).toHaveProperty('properties.from.description');
    expect(jsonSchema).toHaveProperty('properties.unitSlug.description');
    expect(jsonSchema).toHaveProperty('properties.tier.description');
    expect(jsonSchema).toHaveProperty('properties.examBoard.description');
    expect(jsonSchema).toHaveProperty('properties.year.description');
    expect(jsonSchema).toHaveProperty('properties.threadSlug.description');
    expect(jsonSchema).toHaveProperty('properties.highlight.description');
    expect(jsonSchema).toHaveProperty('properties.minLessons.description');
    expect(jsonSchema).toHaveProperty('properties.phaseSlug.description');
    expect(jsonSchema).toHaveProperty('properties.category.description');
    expect(jsonSchema).toHaveProperty('properties.limit.description');
  });
});

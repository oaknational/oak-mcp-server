/**
 * Integration tests for the fetch tool's flat Zod schema.
 *
 * Mirrors the sibling test for `aggregated-search/flat-zod-schema.integration.test.ts`,
 * proving that `.meta({ examples })` round-trips through Zod 4's
 * `z.toJSONSchema()` for the aggregated `fetch` tool's single `id` parameter.
 *
 * This integration-level proof replaces the equivalent assertion previously
 * made at the E2E layer in the now-deleted
 * `tool-examples-metadata.e2e.test.ts` (under
 * `apps/oak-curriculum-mcp-streamable-http/e2e-tests/`), per the testing
 * strategy: keep E2E assertions on system/transport invariants and prove
 * schema-shape semantics in SDK integration tests.
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { FETCH_INPUT_SCHEMA } from './flat-zod-schema.js';
import { wireProperties } from '../test-helpers/advertised-examples.js';

describe('fetch inputSchema round-trip', () => {
  it('exports a defined inputSchema', () => {
    expect(FETCH_INPUT_SCHEMA).toBeDefined();
  });

  it('z.toJSONSchema() carries the authored id metadata to the wire unchanged', () => {
    // Behaviour, never config: the mechanism under test is that whatever
    // `.meta({ examples })` is authored reaches the wire unchanged — a
    // presence-only assertion would stay green if conversion truncated or
    // replaced the authored values. Whether the example VALUES are true of
    // deployed data is a live-probe concern (owner ruling 2026-07-28:
    // tests never test config, only behaviour).
    const properties = wireProperties(FETCH_INPUT_SCHEMA);

    expect(
      FETCH_INPUT_SCHEMA.id.meta()?.examples,
      'id advertises at least one example',
    ).not.toHaveLength(0);
    expect(properties.id?.examples, 'id: metadata in, metadata on the wire').toEqual(
      FETCH_INPUT_SCHEMA.id.meta()?.examples,
    );
  });

  it('z.toJSONSchema() produces a description on the id field', () => {
    const jsonSchema = z.toJSONSchema(z.object(FETCH_INPUT_SCHEMA));

    expect(jsonSchema).toHaveProperty('properties.id.description');
  });
});

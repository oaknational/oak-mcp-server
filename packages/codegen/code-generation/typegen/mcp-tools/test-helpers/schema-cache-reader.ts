/**
 * Test helper: typed reader over the committed schema cache
 * (`schema-cache/api-schema-original.json`) — the committed upstream spec from
 * which the sdk document and every generated mcp-tools artefact derive.
 *
 * Tests derive EXPECTATIONS from this source instead of pinning copies of
 * upstream content, so they redden on generator-mechanism breakage and stay
 * green across upstream content edits. The one sanctioned exception is a
 * designed sentinel, where a pinned value carries a named decision — see
 * `../parts/upstream-param-description-overrides.unit.test.ts`.
 *
 * The cache is Zod-parsed (the fixture-loader precedent), so a malformed or
 * relocated cache fails with a diagnostic rather than an undefined-shaped red.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { z } from 'zod';

const SCHEMA_CACHE_PATH = resolve(
  import.meta.dirname,
  '../../../../schema-cache/api-schema-original.json',
);

const schemaCacheParamSchema = z.object({
  name: z.string(),
  in: z.string().optional(),
  example: z.unknown().optional(),
  description: z.string().optional(),
  schema: z
    .object({
      description: z.string().optional(),
      example: z.unknown().optional(),
      default: z.unknown().optional(),
      maximum: z.number().optional(),
    })
    .optional(),
});

const schemaCacheOperationSchema = z.object({
  parameters: z.array(schemaCacheParamSchema).optional(),
});

const schemaCacheSchema = z.object({
  paths: z.record(z.string(), z.record(z.string(), schemaCacheOperationSchema)),
});

export type SchemaCacheParam = z.infer<typeof schemaCacheParamSchema>;
export type SchemaCachePaths = z.infer<typeof schemaCacheSchema>['paths'];

/** Load and validate the schema cache's paths object; fails loud with a Zod diagnostic. */
export function loadSchemaCachePaths(): SchemaCachePaths {
  const raw = readFileSync(SCHEMA_CACHE_PATH, 'utf-8');
  return schemaCacheSchema.parse(JSON.parse(raw)).paths;
}

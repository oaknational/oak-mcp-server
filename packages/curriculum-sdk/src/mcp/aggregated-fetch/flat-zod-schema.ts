/**
 * Canonical Zod input schema for the fetch tool's MCP registration.
 *
 * Uses `.describe()` and `.meta({ examples })` so the MCP SDK's native
 * `z.toJSONSchema()` conversion produces correct JSON Schema.
 * This is the sole source of input schema truth for the fetch tool.
 */

import { z } from 'zod';

// `satisfies` (not a type annotation) keeps the per-field Zod types visible
// to consumers — the round-trip test reads `.meta()` off the id field — while
// still proving the object is a valid raw shape for MCP registration.
export const FETCH_INPUT_SCHEMA = {
  id: z
    .string()
    .describe(
      'Canonical identifier in format "type:slug" (e.g., "lesson:add-fractions-with-the-same-denominator", "unit:comparing-fractions", "subject:maths", "sequence:maths-primary", "thread:number-multiplication-and-division")',
    )
    .meta({
      examples: [
        'lesson:add-fractions-with-the-same-denominator',
        'unit:comparing-fractions',
        'subject:maths',
        'sequence:maths-primary',
        'thread:number-multiplication-and-division',
      ],
    }),
} satisfies z.ZodRawShape;

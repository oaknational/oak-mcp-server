/**
 * Served-surface filter for guidance content tool references.
 *
 * INTERIM app-side cure (Director disposition 2026-07-23, under the
 * owner's standing invariant on MCP-101): the SDK's tool-guidance
 * content structurally names tools in its category `tools` arrays, and
 * the SDK is deliberately app-agnostic — it cannot know the served
 * surface. This module filters those structured references to
 * served-live entries at the serve boundary (the same composition
 * point as the landing-page filter), so guidance never advertises a
 * tool a client cannot call. The SDK content itself is never
 * hand-edited: a tool going live later needs no content re-add.
 *
 * Replaced structurally by the MCP-121 statement model, whose
 * projections are served-state-aware by construction.
 *
 * Category `tools` arrays are the only structured tool references
 * filtered; workflow steps and prose are MCP-121 territory (verified
 * 2026-07-23: no dormant name appears in either).
 */

import { z } from 'zod';
import { typeSafeEntries } from '../type-helpers.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { SERVED_SURFACE } from './served-surface.js';

/** Names live in the definition (universal + app-local), computed once. */
const LIVE_TOOL_NAMES: ReadonlySet<string> = new Set(
  [
    ...typeSafeEntries(SERVED_SURFACE.universalTools),
    ...typeSafeEntries(SERVED_SURFACE.appLocalTools),
  ]
    .filter(([, state]) => state === 'live')
    .map(([name]) => name),
);

/** A guidance category: only the `tools` array is transformed; the rest rides through. */
const CATEGORY_SCHEMA = z.object({ tools: z.array(z.string()).optional() }).loose();

/** Any value carrying tool guidance with structured category tool references. */
const GUIDANCE_BEARER_SCHEMA = z
  .object({
    toolGuidance: z.object({ toolCategories: z.record(z.string(), CATEGORY_SCHEMA) }).loose(),
  })
  .loose();

/**
 * Filters structured tool references in guidance-bearing content to the
 * served-surface's live entries. Values that do not carry the guidance
 * shape pass through untouched — this is a serve-boundary transform,
 * never a validator.
 */
export function filterGuidanceToolReferences(value: unknown): unknown {
  const parsed = GUIDANCE_BEARER_SCHEMA.safeParse(value);
  if (!parsed.success) {
    return value;
  }
  const toolCategories = Object.fromEntries(
    typeSafeEntries(parsed.data.toolGuidance.toolCategories).map(([key, category]) => [
      key,
      category.tools === undefined
        ? category
        : { ...category, tools: category.tools.filter((name) => LIVE_TOOL_NAMES.has(name)) },
    ]),
  );
  return {
    ...parsed.data,
    toolGuidance: { ...parsed.data.toolGuidance, toolCategories },
  };
}

/**
 * Resource-leg transform: filters the curriculum-model JSON string the
 * `curriculum://model` resource serves. Unparseable input rides through
 * unchanged (the source is the SDK's own compile-time serialisation).
 */
export function filterCurriculumModelJson(json: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return json;
  }
  return JSON.stringify(filterGuidanceToolReferences(parsed));
}

/**
 * Tool-leg transform: filters a `get-curriculum-model` CallToolResult —
 * both its `structuredContent` and any text content block that carries
 * the guidance shape (the serialised-data block).
 */
export function filterCurriculumModelToolResult(result: CallToolResult): CallToolResult {
  const content = result.content.map((block) =>
    block.type === 'text' ? { ...block, text: filterCurriculumModelJson(block.text) } : block,
  );
  if (result.structuredContent === undefined) {
    return { ...result, content };
  }
  const filtered = filterGuidanceToolReferences(result.structuredContent);
  // structuredContent's declared shape is a string-keyed record; the
  // transform returns objects, so this parse re-establishes the record
  // type without an assertion and falls back to the original on mismatch.
  const record = z.record(z.string(), z.unknown()).safeParse(filtered);
  return {
    ...result,
    content,
    structuredContent: record.success ? record.data : result.structuredContent,
  };
}

/**
 * Integration tests for the anchored get-prior-knowledge-graph tool.
 *
 * @remarks
 *
 * These tests describe the TOOL ENVELOPE: input parsing at the MCP boundary,
 * dispatch to the statements view, and the response shape (summary
 * TextContent + serialised JSON TextContent + structuredContent). Anchor
 * resolution semantics are specified by the view's own tests in
 * `@oaknational/graph-corpus-sdk` and are not re-specified here.
 *
 * Anchor fixtures are chosen deterministically from the corpus so the tests
 * describe behaviour over any valid corpus rather than pinning content.
 */

import { createCurriculumGraphViews } from '@oaknational/graph-corpus-sdk/curriculum';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types';
import type { CurriculumGraphViews } from '@oaknational/graph-corpus-sdk/curriculum';
import { formatError } from './universal-tool-shared.js';
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { fixtureCorpus } from '../../../graph-corpus-sdk/src/curriculum/__tests__/fixture-corpus.js';
import {
  GET_PRIOR_KNOWLEDGE_GRAPH_TOOL_DEF,
  parsePriorKnowledgeGraphInput,
  runPriorKnowledgeGraphTool,
} from './aggregated-prior-knowledge-graph.js';

const views = createCurriculumGraphViews(fixtureCorpus);

function callPriorKnowledgeGraph(args: unknown, graphViews: CurriculumGraphViews): CallToolResult {
  const input = parsePriorKnowledgeGraphInput(args);
  return input.ok ? runPriorKnowledgeGraphTool(input.value, graphViews) : formatError(input.error);
}

/** A corpus unit slug, chosen deterministically (lexicographic minimum). */
const firstUnitSlug = fixtureCorpus.nodes
  .filter((node) => node.kind === 'unit')
  .map((node) => node.unitSlug)
  .sort((a, b) => a.localeCompare(b))[0];
if (firstUnitSlug === undefined) {
  throw new Error('corpus has no unit nodes to anchor the tool tests');
}
const knownUnitSlug: string = firstUnitSlug;

/**
 * Schema-driven narrowing of the carrier's loose `structuredContent` — the
 * test-boundary alternative to a type assertion. Non-strict: the family
 * envelope adds `summary` / `status` alongside the statements fields.
 */
const STATEMENTS_ENVELOPE = z.object({
  units: z.array(
    z.object({
      unitSlug: z.string(),
      priorKnowledge: z.array(z.string()),
      threadSlugs: z.array(z.string()),
    }),
  ),
  resolvedAnchors: z.array(z.string()),
  unknownAnchors: z.array(z.string()),
});

const TEXT_CONTENT = z.object({ type: z.literal('text'), text: z.string() });

describe('GET_PRIOR_KNOWLEDGE_GRAPH_TOOL_DEF', () => {
  it('describes the anchored stated-statements contract, not a traversal', () => {
    expect(GET_PRIOR_KNOWLEDGE_GRAPH_TOOL_DEF.description).toContain('anchor');
    expect(GET_PRIOR_KNOWLEDGE_GRAPH_TOOL_DEF.description).toContain('unitSlugs');
    expect(GET_PRIOR_KNOWLEDGE_GRAPH_TOOL_DEF.description).toContain('stated prior knowledge');
  });

  it('has annotations marking it as read-only and idempotent', () => {
    expect(GET_PRIOR_KNOWLEDGE_GRAPH_TOOL_DEF.annotations).toEqual({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
      title: GET_PRIOR_KNOWLEDGE_GRAPH_TOOL_DEF.title,
    });
  });
});

describe('runPriorKnowledgeGraphTool', () => {
  it('returns the statements envelope for a known anchor: summary + JSON content and structuredContent', () => {
    const result = callPriorKnowledgeGraph({ unitSlugs: [knownUnitSlug] }, views);

    expect(result.isError).toBeUndefined();
    // MCP spec SHOULD: structured content is mirrored by serialised TextContent.
    expect(result.content).toHaveLength(2);
    const [summary, json] = result.content;
    expect(summary).toMatchObject({ type: 'text' });
    expect(json).toMatchObject({ type: 'text' });

    const structured = STATEMENTS_ENVELOPE.parse(result.structuredContent);
    expect(structured.resolvedAnchors).toHaveLength(1);
    expect(structured.resolvedAnchors[0]).toContain(knownUnitSlug);
    expect(structured.unknownAnchors).toStrictEqual([]);
    expect(structured.units).toHaveLength(1);
    expect(structured.units[0]?.unitSlug).toBe(knownUnitSlug);
  });

  it('reports unknown anchors as information, not an error', () => {
    const result = callPriorKnowledgeGraph(
      {
        unitSlugs: [knownUnitSlug, 'definitely-not-a-real-unit-slug-xyz'],
      },
      views,
    );

    expect(result.isError).toBeUndefined();
    const structured = STATEMENTS_ENVELOPE.parse(result.structuredContent);
    expect(structured.unknownAnchors).toStrictEqual(['definitely-not-a-real-unit-slug-xyz']);
    const summary = TEXT_CONTENT.parse(result.content[0]);
    expect(summary.text).toContain('unknown');
  });

  it('returns a well-formed empty envelope when no anchors resolve', () => {
    const result = callPriorKnowledgeGraph({ unitSlugs: ['no-such-unit-anywhere'] }, views);

    expect(result.isError).toBeUndefined();
    const structured = STATEMENTS_ENVELOPE.parse(result.structuredContent);
    expect(structured.units).toStrictEqual([]);
    expect(structured.resolvedAnchors).toStrictEqual([]);
    expect(structured.unknownAnchors).toStrictEqual(['no-such-unit-anywhere']);
  });

  it('strips the retired depth input rather than erroring (old callers keep working)', () => {
    const result = callPriorKnowledgeGraph({ unitSlugs: [knownUnitSlug], depth: 2 }, views);

    expect(result.isError).toBeUndefined();
    const structured = STATEMENTS_ENVELOPE.parse(result.structuredContent);
    expect(structured.resolvedAnchors).toHaveLength(1);
  });

  it('rejects input without unitSlugs at the input boundary', () => {
    const result = callPriorKnowledgeGraph({}, views);

    expect(result.isError).toBe(true);
  });

  it('rejects non-object input at the input boundary', () => {
    const result = callPriorKnowledgeGraph('unitSlugs', views);

    expect(result.isError).toBe(true);
  });
});

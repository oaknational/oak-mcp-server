/**
 * Unit tests for the serve-boundary guidance-content filter.
 *
 * The filter narrows structured tool references (category `tools`
 * arrays) to the served-surface's live entries; everything else rides
 * through untouched. The cross-surface dormant-absence walk proves the
 * end-to-end effect; these tests describe the transform's own contract.
 */

import { describe, it, expect } from 'vitest';
import {
  filterGuidanceToolReferences,
  filterCurriculumModelJson,
  filterCurriculumModelToolResult,
} from './filter-guidance-content.js';

/** A minimal guidance-bearing value with one live and one dormant reference. */
function guidanceBearer(): { toolGuidance: { toolCategories: Record<string, unknown> } } {
  return {
    toolGuidance: {
      toolCategories: {
        discovery: {
          tools: ['search', 'user-search'],
          description: 'Find things.',
        },
      },
    },
  };
}

describe('filterGuidanceToolReferences', () => {
  it('keeps live references and removes dormant ones from category tools arrays', () => {
    const filtered = filterGuidanceToolReferences(guidanceBearer());
    expect(filtered).toMatchObject({
      toolGuidance: {
        toolCategories: { discovery: { tools: ['search'], description: 'Find things.' } },
      },
    });
  });

  it('passes non-guidance shapes through untouched', () => {
    const value = { answerType: 'strand-lookup', members: [] };
    expect(filterGuidanceToolReferences(value)).toBe(value);
  });

  it('leaves categories without a tools array intact', () => {
    const value = {
      toolGuidance: { toolCategories: { notes: { description: 'No tools here.' } } },
    };
    expect(filterGuidanceToolReferences(value)).toMatchObject(value);
  });
});

describe('filterCurriculumModelJson', () => {
  it('filters serialised guidance content', () => {
    const filtered: unknown = JSON.parse(
      filterCurriculumModelJson(JSON.stringify(guidanceBearer())),
    );
    expect(filtered).toMatchObject({
      toolGuidance: { toolCategories: { discovery: { tools: ['search'] } } },
    });
  });

  it('returns unparseable input unchanged', () => {
    expect(filterCurriculumModelJson('not json')).toBe('not json');
  });
});

describe('filterCurriculumModelToolResult', () => {
  it('filters both the structuredContent and the serialised text block', () => {
    const bearer = guidanceBearer();
    const result = filterCurriculumModelToolResult({
      content: [
        { type: 'text', text: 'Oak Curriculum model loaded.' },
        { type: 'text', text: JSON.stringify(bearer) },
      ],
      structuredContent: { ...bearer, summary: 'Oak Curriculum model loaded.' },
    });

    expect(result.structuredContent).toMatchObject({
      toolGuidance: { toolCategories: { discovery: { tools: ['search'] } } },
      summary: 'Oak Curriculum model loaded.',
    });
    const textBlock = result.content[1];
    expect(textBlock?.type).toBe('text');
    if (textBlock?.type === 'text') {
      expect(JSON.parse(textBlock.text)).toMatchObject({
        toolGuidance: { toolCategories: { discovery: { tools: ['search'] } } },
      });
    }
    // The plain summary block is not JSON and rides through unchanged.
    expect(result.content[0]).toEqual({ type: 'text', text: 'Oak Curriculum model loaded.' });
  });
});

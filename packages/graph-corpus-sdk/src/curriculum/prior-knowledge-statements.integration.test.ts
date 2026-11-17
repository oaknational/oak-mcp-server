import { describe, it, expect } from 'vitest';

import { fixtureCorpus } from './test-fixture-corpus.js';
import { required } from './test-helpers.js';
import { createCurriculumGraphViews } from './views.js';

const { priorKnowledgeStatements } = createCurriculumGraphViews(fixtureCorpus);

const unitNodes = fixtureCorpus.nodes
  .filter((node) => node.kind === 'unit')
  .sort((a, b) => a.unitSlug.localeCompare(b.unitSlug));
const firstUnit = required(unitNodes[0], 'fixture has no unit nodes');
const knownSlug: string = firstUnit.unitSlug;

describe('priorKnowledgeStatements', () => {
  it('returns the anchor unit with its stated prior knowledge and thread memberships', () => {
    const result = priorKnowledgeStatements([knownSlug]);

    expect(result.resolvedAnchors).toStrictEqual([`unit:${knownSlug}`]);
    expect(result.unknownAnchors).toStrictEqual([]);
    expect(result.units).toHaveLength(1);
    const unit = result.units[0];
    expect(unit?.unitSlug).toBe(knownSlug);
    expect(unit?.priorKnowledge).toStrictEqual([...new Set(firstUnit.priorKnowledge)]);
    expect(unit?.threadSlugs).toStrictEqual(firstUnit.threadSlugs);
  });

  it('collapses duplicate anchors with set semantics, first occurrence kept', () => {
    const result = priorKnowledgeStatements([knownSlug, knownSlug]);

    expect(result.resolvedAnchors).toStrictEqual([`unit:${knownSlug}`]);
    expect(result.units).toHaveLength(1);
  });

  it('collapses exact-duplicate statements within a unit, first occurrence kept', () => {
    const dupUnit = required(
      unitNodes.find((node) => new Set(node.priorKnowledge).size !== node.priorKnowledge.length),
      'fixture has no unit with duplicate prior-knowledge statements',
    );

    const result = priorKnowledgeStatements([dupUnit.unitSlug]);
    const served = required(result.units[0], 'anchor unit did not resolve').priorKnowledge;

    expect(new Set(served).size).toBe(served.length);
    expect(served.length).toBeLessThan(dupUnit.priorKnowledge.length);
    expect(served).toStrictEqual([...new Set(dupUnit.priorKnowledge)]);
  });

  it('returns a known unit that records no statements as empty, not as unknown', () => {
    const emptyUnit = required(
      unitNodes.find((node) => node.priorKnowledge.length === 0),
      'fixture has no unit with an empty prior-knowledge list',
    );

    const result = priorKnowledgeStatements([emptyUnit.unitSlug]);

    expect(result.resolvedAnchors).toStrictEqual([`unit:${emptyUnit.unitSlug}`]);
    expect(result.unknownAnchors).toStrictEqual([]);
    expect(result.units[0]?.priorKnowledge).toStrictEqual([]);
  });

  it('reports unknown slugs verbatim, never as an error', () => {
    const result = priorKnowledgeStatements([knownSlug, 'no-such-unit-anywhere']);

    expect(result.unknownAnchors).toStrictEqual(['no-such-unit-anywhere']);
    expect(result.units).toHaveLength(1);
  });

  it('returns a well-formed empty result for an empty anchor list', () => {
    const result = priorKnowledgeStatements([]);

    expect(result.units).toStrictEqual([]);
    expect(result.resolvedAnchors).toStrictEqual([]);
    expect(result.unknownAnchors).toStrictEqual([]);
  });

  it('keeps units in resolved-anchor order for multi-anchor calls', () => {
    const secondUnit = required(unitNodes[1], 'fixture has fewer than two unit nodes');

    const result = priorKnowledgeStatements([secondUnit.unitSlug, knownSlug]);

    expect(result.units.map((unit) => unit.unitSlug)).toStrictEqual([
      secondUnit.unitSlug,
      knownSlug,
    ]);
  });
});

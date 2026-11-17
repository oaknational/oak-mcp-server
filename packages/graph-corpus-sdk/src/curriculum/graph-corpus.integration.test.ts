import { describe, expect, it } from 'vitest';

import type { CurriculumGraphCorpus } from './projection-helpers.js';
import { fixtureCorpus } from './test-fixture-corpus.js';
import { unwrapOk } from './test-helpers.js';
import { createCurriculumGraphViews } from './views.js';

const EDGE_TYPES = [
  'prerequisiteFor',
  'containsUnit',
  'containsLesson',
  'addressesMisconception',
  'containsKeyword',
] as const;

describe('curriculum graph views over a corpus value', () => {
  it('uses a fixture with every node kind and edge type, kind-qualified ids and no dangling edge', () => {
    const ids = new Set(fixtureCorpus.nodes.map((node) => node.id));

    for (const kind of ['unit', 'thread', 'lesson', 'misconception', 'keyword'] as const) {
      expect(fixtureCorpus.nodes.some((node) => node.kind === kind)).toBe(true);
    }
    for (const type of EDGE_TYPES) {
      expect(fixtureCorpus.edges.some((edge) => edge.type === type)).toBe(true);
    }
    expect(fixtureCorpus.nodes.every((node) => node.id.startsWith(`${node.kind}:`))).toBe(true);
    expect(ids.size).toBe(fixtureCorpus.nodes.length);
    expect(
      fixtureCorpus.edges.filter((edge) => !ids.has(edge.source) || !ids.has(edge.target)),
    ).toStrictEqual([]);
  });

  it('serves every view from the corpus it was given', () => {
    const views = createCurriculumGraphViews(fixtureCorpus);

    expect(views.priorKnowledgeStatements(['unit-b']).resolvedAnchors).toStrictEqual([
      'unit:unit-b',
    ]);
    expect(views.misconceptionsForLessons(['lesson-c-1']).lessons).toHaveLength(1);
    expect(views.misconceptionsForUnits(['unit-c']).units).toHaveLength(1);
    expect(unwrapOk(views.misconceptionsForThread('long-thread')).threads).toHaveLength(1);
    expect(views.progressionForThread('energy-thread').threads).toHaveLength(1);
    expect(views.progressionsForSubjectKeyStage('science', 'ks3').threads).toHaveLength(2);
    expect(unwrapOk(views.keywordsForSubjectKeyStage('science', 'ks3')).totalMatchingKeywords).toBe(
      2,
    );
  });

  it('fails loudly when an edge names a node the corpus does not hold', () => {
    const dangling: CurriculumGraphCorpus = {
      ...fixtureCorpus,
      edges: [
        ...fixtureCorpus.edges,
        { source: 'lesson:lesson-c-1', type: 'containsKeyword', target: 'keyword:no-such-term' },
      ],
    };
    const views = createCurriculumGraphViews(dangling);

    expect(() => views.keywordsForSubjectKeyStage('maths', 'ks2')).toThrow(
      'graph corpus integrity breach',
    );
  });
});

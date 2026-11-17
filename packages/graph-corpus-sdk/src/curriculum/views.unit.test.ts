import { describe, expect, it } from 'vitest';

import type { CurriculumGraphCorpus } from './projection-helpers.js';
import { createCurriculumGraphViews } from './views.js';

function countingCorpus(): { readonly corpus: CurriculumGraphCorpus; nodeReads: () => number } {
  let reads = 0;
  const empty: CurriculumGraphCorpus = { nodes: [], edges: [], sequences: [], unitLessonRuns: [] };
  const corpus: CurriculumGraphCorpus = {
    get nodes() {
      reads += 1;
      return empty.nodes;
    },
    edges: empty.edges,
    sequences: empty.sequences,
    unitLessonRuns: empty.unitLessonRuns,
  };
  return { corpus, nodeReads: () => reads };
}

describe('createCurriculumGraphViews', () => {
  it('builds no projection until a view is called', () => {
    const { corpus, nodeReads } = countingCorpus();

    createCurriculumGraphViews(corpus);

    expect(nodeReads()).toBe(0);
  });

  it('builds each projection once, on its first view call', () => {
    const { corpus, nodeReads } = countingCorpus();
    const views = createCurriculumGraphViews(corpus);

    views.progressionForThread('a-thread');
    views.progressionsForSubjectKeyStage('maths', 'ks2');
    expect(nodeReads()).toBe(1);

    views.misconceptionsForLessons(['a-lesson']);
    views.misconceptionsForUnits(['a-unit']);
    views.misconceptionsForThread('a-thread');
    expect(nodeReads()).toBe(2);

    views.keywordsForSubjectKeyStage('maths', 'ks2');
    views.keywordsForSubjectKeyStage('maths', 'ks3');
    expect(nodeReads()).toBe(3);

    views.priorKnowledgeStatements(['a-unit']);
    views.priorKnowledgeStatements(['another-unit']);
    expect(nodeReads()).toBe(4);
  });
});

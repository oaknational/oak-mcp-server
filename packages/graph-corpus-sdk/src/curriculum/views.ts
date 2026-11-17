import type { Result } from '@oaknational/result';

import { buildCurriculumKeywordProjection } from './keyword-projection.js';
import {
  keywordsForSubjectKeyStage,
  type KeywordLimitInvalid,
  type KeywordRetrievalOptions,
  type KeywordSubgraph,
} from './keyword-view.js';
import { buildCurriculumMisconceptionProjection } from './misconception-projection.js';
import {
  misconceptionsForLessons,
  misconceptionsForThread,
  misconceptionsForUnits,
  type LessonMisconceptionsSubgraph,
  type ThreadMisconceptionsSubgraph,
  type ThreadMisconceptionsWindow,
  type ThreadWindowInvalid,
  type UnitMisconceptionsSubgraph,
} from './misconception-view.js';
import {
  buildUnitNodesById,
  priorKnowledgeStatements,
  type PriorKnowledgeStatements,
} from './prior-knowledge-statements.js';
import type { CurriculumGraphCorpus } from './projection-helpers.js';
import { buildCurriculumThreadProgressionsProjection } from './thread-progressions-projection.js';
import {
  progressionForThread,
  progressionsForSubjectKeyStage,
  type ThreadDiscovery,
  type ThreadProgressionSubgraph,
} from './thread-progressions-view.js';

/** The anchored curriculum graph views, bound to one corpus value. */
export interface CurriculumGraphViews {
  readonly priorKnowledgeStatements: (unitSlugs: readonly string[]) => PriorKnowledgeStatements;
  readonly misconceptionsForLessons: (
    lessonSlugs: readonly string[],
  ) => LessonMisconceptionsSubgraph;
  readonly misconceptionsForUnits: (unitSlugs: readonly string[]) => UnitMisconceptionsSubgraph;
  readonly misconceptionsForThread: (
    threadSlug: string,
    window?: ThreadMisconceptionsWindow,
  ) => Result<ThreadMisconceptionsSubgraph, ThreadWindowInvalid>;
  readonly progressionForThread: (threadSlug: string) => ThreadProgressionSubgraph;
  readonly progressionsForSubjectKeyStage: (subject: string, keyStage: string) => ThreadDiscovery;
  readonly keywordsForSubjectKeyStage: (
    subject: string,
    keyStage: string,
    options?: KeywordRetrievalOptions,
  ) => Result<KeywordSubgraph, KeywordLimitInvalid>;
}

function lazy<T>(build: () => T): () => T {
  let built: { readonly value: T } | undefined;
  return () => {
    built ??= { value: build() };
    return built.value;
  };
}

/** Builds the curriculum graph views over `corpus`, each projection on its view's first call. */
export function createCurriculumGraphViews(corpus: CurriculumGraphCorpus): CurriculumGraphViews {
  const unitNodes = lazy(() => buildUnitNodesById(corpus));
  const misconceptions = lazy(() => buildCurriculumMisconceptionProjection(corpus));
  const threads = lazy(() => buildCurriculumThreadProgressionsProjection(corpus));
  const keywords = lazy(() => buildCurriculumKeywordProjection(corpus));
  return {
    priorKnowledgeStatements: (unitSlugs) => priorKnowledgeStatements(unitNodes(), unitSlugs),
    misconceptionsForLessons: (lessonSlugs) =>
      misconceptionsForLessons(misconceptions(), lessonSlugs),
    misconceptionsForUnits: (unitSlugs) => misconceptionsForUnits(misconceptions(), unitSlugs),
    misconceptionsForThread: (threadSlug, window) =>
      misconceptionsForThread(misconceptions(), threadSlug, window),
    progressionForThread: (threadSlug) => progressionForThread(threads(), threadSlug),
    progressionsForSubjectKeyStage: (subject, keyStage) =>
      progressionsForSubjectKeyStage(threads(), subject, keyStage),
    keywordsForSubjectKeyStage: (subject, keyStage, options) =>
      keywordsForSubjectKeyStage(keywords(), subject, keyStage, options),
  };
}

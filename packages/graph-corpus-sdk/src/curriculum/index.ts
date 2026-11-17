/**
 * Curriculum graph subpath barrel: `@oaknational/graph-corpus-sdk/curriculum`.
 *
 * The generated one-graph corpus (G1a) plus the bounded anchored views over
 * it: `priorKnowledgeStatements` answers "what is the prior knowledge of
 * these units?" as each unit's stated prior-knowledge statements;
 * `misconceptionsForLessons` / `misconceptionsForUnits` /
 * `misconceptionsForThread` (G2) answer "which misconceptions does this
 * anchor address?" over the thread→unit→lesson→misconception chain;
 * `progressionForThread` / `progressionsForSubjectKeyStage` (G3) answer "how
 * does this thread progress across years?" over the per-subject,
 * curriculum-ordered sequences;
 * `keywordsForSubjectKeyStage` (G4b) answers "what is the key vocabulary for
 * this teaching context?" as a bounded frequency-ranked keyword page with
 * lesson decoration.
 */

import { graphCorpus } from './graph-corpus.js';
import { buildCurriculumThreadProgressionsProjection } from './thread-progressions-projection.js';
import { buildThreadProgressionStats } from './thread-progressions-view.js';
import { createCurriculumGraphViews } from './views.js';

export {
  graphCorpus,
  type GraphCorpus,
  type GraphCorpusEdge,
  type GraphCorpusLessonNode,
  type GraphCorpusMisconceptionNode,
  type GraphCorpusNodeId,
  type GraphCorpusSequence,
  type GraphCorpusSequencePlacement,
  type GraphCorpusUnitLessonRun,
  type GraphCorpusThreadNode,
  type GraphCorpusUnitNode,
} from './graph-corpus.js';

export { createCurriculumGraphViews, type CurriculumGraphViews } from './views.js';

export type { CurriculumGraphCorpus } from './projection-helpers.js';

export type { PriorKnowledgeStatements } from './prior-knowledge-statements.js';

export {
  buildCurriculumMisconceptionProjection,
  type CurriculumMisconceptionProjection,
} from './misconception-projection.js';

export {
  DEFAULT_THREAD_UNIT_LIMIT,
  MAX_THREAD_UNIT_LIMIT,
  type LessonMisconceptions,
  type LessonMisconceptionsSubgraph,
  type ThreadMisconceptions,
  type ThreadMisconceptionsSubgraph,
  type ThreadMisconceptionsWindow,
  type ThreadWindowInvalid,
  type UnitMisconceptions,
  type UnitMisconceptionsSubgraph,
} from './misconception-view.js';

export {
  buildCurriculumThreadProgressionsProjection,
  type CurriculumThreadProgressionsProjection,
} from './thread-progressions-projection.js';

export type {
  SubjectProgression,
  ThreadDescriptor,
  ThreadDiscovery,
  ThreadProgression,
  ThreadProgressionEntry,
  ThreadProgressionStats,
  ThreadProgressionSubgraph,
} from './thread-progressions-view.js';

export {
  buildCurriculumKeywordProjection,
  type CurriculumKeywordProjection,
} from './keyword-projection.js';

export {
  DEFAULT_KEYWORD_LIMIT,
  KEYWORD_LESSON_DECORATION_LIMIT,
  MAX_KEYWORD_LIMIT,
  type KeywordLessons,
  type KeywordLimitInvalid,
  type KeywordRetrievalOptions,
  type KeywordSubgraph,
} from './keyword-view.js';

/** The views bound to the generated corpus. */
export const {
  priorKnowledgeStatements,
  misconceptionsForLessons,
  misconceptionsForUnits,
  misconceptionsForThread,
  progressionForThread,
  progressionsForSubjectKeyStage,
  keywordsForSubjectKeyStage,
} = createCurriculumGraphViews(graphCorpus);

/** Thread-estate counts over the generated corpus. */
export const threadProgressionStats = buildThreadProgressionStats(
  buildCurriculumThreadProgressionsProjection(graphCorpus),
);

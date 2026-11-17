import type { ThreadProgressionStats } from './thread-progressions-view.js';

export type {
  GraphCorpus,
  GraphCorpusEdge,
  GraphCorpusLessonNode,
  GraphCorpusMisconceptionNode,
  GraphCorpusNodeId,
  GraphCorpusSequence,
  GraphCorpusSequencePlacement,
  GraphCorpusUnitLessonRun,
  GraphCorpusThreadNode,
  GraphCorpusUnitNode,
} from '@oaknational/sdk-codegen/graph-corpus';

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

const THREAD_STATS_FROZEN_AT_2026_09_03_BULK_DOWNLOAD: ThreadProgressionStats = {
  threadCount: 160,
  subjectsCovered: [
    'art',
    'citizenship',
    'computing',
    'cooking-nutrition',
    'design-technology',
    'english',
    'french',
    'geography',
    'german',
    'history',
    'maths',
    'music',
    'physical-education',
    'religious-education',
    'rshe-pshe',
    'science',
    'spanish',
  ],
};

export const threadProgressionStats = THREAD_STATS_FROZEN_AT_2026_09_03_BULK_DOWNLOAD;

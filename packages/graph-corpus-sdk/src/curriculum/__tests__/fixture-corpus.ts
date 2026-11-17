import type {
  GraphCorpus,
  GraphCorpusEdge,
  GraphCorpusKeywordNode,
  GraphCorpusLessonNode,
  GraphCorpusMisconceptionNode,
  GraphCorpusSequence,
  GraphCorpusThreadNode,
  GraphCorpusUnitLessonRun,
  GraphCorpusUnitNode,
} from '@oaknational/sdk-codegen/graph-corpus';

interface UnitSpec {
  readonly slug: string;
  readonly subject: string;
  readonly keyStage: string;
  readonly year: number | undefined;
  readonly priorKnowledge: readonly string[];
  readonly lessons: readonly string[];
}

interface LessonSpec {
  readonly slug: string;
  readonly misconceptions: number;
  readonly keywords: readonly string[];
}

interface ThreadSpec {
  readonly slug: string;
  readonly sequences: readonly {
    readonly subject: string;
    readonly placements: readonly (readonly [unitSlug: string, year: number | undefined])[];
  }[];
}

function mathsUnit(slug: string, year: number | undefined, lessons: readonly string[]): UnitSpec {
  return { slug, subject: 'maths', keyStage: 'ks2', year, priorKnowledge: [], lessons };
}

function scienceUnit(slug: string, year: number, lessons: readonly string[]): UnitSpec {
  return { slug, subject: 'science', keyStage: 'ks3', year, priorKnowledge: [], lessons };
}

const UNITS: readonly UnitSpec[] = [
  {
    ...mathsUnit('unit-a', 3, ['lesson-a-3', 'lesson-a-1', 'lesson-a-2']),
    priorKnowledge: ['Counts in tens.', 'Reads two-digit numbers.', 'Counts in tens.'],
  },
  {
    ...mathsUnit('unit-b', 3, ['lesson-b-1', 'lesson-shared']),
    priorKnowledge: ['Halves a shape.'],
  },
  mathsUnit('unit-c', 3, ['lesson-c-1', 'lesson-shared']),
  mathsUnit('unit-d', 4, ['lesson-d-1']),
  mathsUnit('unit-e', 4, ['lesson-e-1']),
  mathsUnit('unit-f', 4, ['lesson-f-1']),
  mathsUnit('unit-g', 5, ['lesson-g-1']),
  mathsUnit('unit-h', 5, ['lesson-h-1']),
  mathsUnit('unit-i', 5, ['lesson-i-1']),
  mathsUnit('unit-j', 6, ['lesson-j-1']),
  mathsUnit('unit-k', 6, ['lesson-k-1']),
  mathsUnit('unit-l', undefined, ['lesson-l-1']),
  scienceUnit('unit-s1', 7, ['lesson-s1-1']),
  scienceUnit('unit-s2', 8, ['lesson-s2-1']),
  scienceUnit('unit-s3', 9, ['lesson-s3-1']),
];

const LESSONS: readonly LessonSpec[] = [
  { slug: 'lesson-a-1', misconceptions: 2, keywords: ['numeral', 'fraction'] },
  { slug: 'lesson-a-2', misconceptions: 1, keywords: ['numeral', 'fraction'] },
  { slug: 'lesson-a-3', misconceptions: 1, keywords: ['numeral', 'fraction'] },
  { slug: 'lesson-b-1', misconceptions: 0, keywords: ['numeral', 'fraction'] },
  { slug: 'lesson-shared', misconceptions: 1, keywords: ['numeral', 'angle'] },
  { slug: 'lesson-c-1', misconceptions: 1, keywords: ['numeral', 'angle'] },
  { slug: 'lesson-d-1', misconceptions: 1, keywords: ['numeral', 'ratio'] },
  { slug: 'lesson-e-1', misconceptions: 1, keywords: ['numeral', 'volume'] },
  ...['f', 'g', 'h', 'i', 'j', 'k', 'l'].map((letter): LessonSpec => ({
    slug: `lesson-${letter}-1`,
    misconceptions: 1,
    keywords: ['numeral'],
  })),
  { slug: 'lesson-s1-1', misconceptions: 1, keywords: ['numeral', 'energy'] },
  { slug: 'lesson-s2-1', misconceptions: 1, keywords: ['energy'] },
  { slug: 'lesson-s3-1', misconceptions: 1, keywords: ['energy'] },
];

const THREADS: readonly ThreadSpec[] = [
  {
    slug: 'long-thread',
    sequences: [
      {
        subject: 'maths',
        placements: [
          ['unit-c', 3],
          ['unit-a', 3],
          ['unit-b', 3],
          ['unit-f', 4],
          ['unit-d', 4],
          ['unit-e', 4],
          ['unit-i', 5],
          ['unit-a', 5],
          ['unit-g', 5],
          ['unit-h', 5],
          ['unit-k', 6],
          ['unit-j', 6],
          ['unit-l', undefined],
        ],
      },
    ],
  },
  {
    slug: 'shared-thread',
    sequences: [
      {
        subject: 'maths',
        placements: [
          ['unit-e', 4],
          ['unit-d', 4],
          ['unit-j', 6],
        ],
      },
      {
        subject: 'science',
        placements: [
          ['unit-s1', 7],
          ['unit-s2', 8],
        ],
      },
    ],
  },
  {
    slug: 'energy-thread',
    sequences: [
      {
        subject: 'science',
        placements: [
          ['unit-s2', 8],
          ['unit-s3', 9],
        ],
      },
    ],
  },
];

function lessonUnit(lessonSlug: string): UnitSpec {
  const unit = UNITS.find((spec) => spec.lessons.includes(lessonSlug));
  if (unit === undefined) {
    throw new Error(`fixture lesson ${lessonSlug} sits in no unit`);
  }
  return unit;
}

function threadNode(spec: ThreadSpec): GraphCorpusThreadNode {
  const years = spec.sequences
    .flatMap((sequence) => sequence.placements.map(([, year]) => year))
    .filter((year): year is number => year !== undefined);
  return {
    kind: 'thread',
    id: `thread:${spec.slug}`,
    threadSlug: spec.slug,
    title: `Invented ${spec.slug}`,
    firstYear: Math.min(...years),
    lastYear: Math.max(...years),
  };
}

function unitNode(spec: UnitSpec): GraphCorpusUnitNode {
  return {
    kind: 'unit',
    id: `unit:${spec.slug}`,
    unitSlug: spec.slug,
    unitTitle: `Invented ${spec.slug}`,
    subject: spec.subject,
    keyStage: spec.keyStage,
    year: spec.year,
    priorKnowledge: spec.priorKnowledge,
    threadSlugs: THREADS.filter((thread) =>
      thread.sequences.some((sequence) =>
        sequence.placements.some(([unitSlug]) => unitSlug === spec.slug),
      ),
    ).map((thread) => thread.slug),
  };
}

function lessonNode(spec: LessonSpec): GraphCorpusLessonNode {
  const unit = lessonUnit(spec.slug);
  return {
    kind: 'lesson',
    id: `lesson:${spec.slug}`,
    lessonSlug: spec.slug,
    lessonTitle: `Invented ${spec.slug}`,
    subject: unit.subject,
    keyStage: unit.keyStage,
  };
}

function misconceptionNodes(spec: LessonSpec): readonly GraphCorpusMisconceptionNode[] {
  return Array.from({ length: spec.misconceptions }, (_, index) => ({
    kind: 'misconception',
    id: `misconception:${spec.slug}#${String(index)}`,
    misconception: `Invented misconception ${String(index)} for ${spec.slug}.`,
    response: `Invented response ${String(index)} for ${spec.slug}.`,
  }));
}

function keywordNodes(): readonly GraphCorpusKeywordNode[] {
  const terms = [...new Set(LESSONS.flatMap((spec) => spec.keywords))].sort();
  return terms.map((term) => {
    const units = LESSONS.filter((spec) => spec.keywords.includes(term)).map((spec) =>
      lessonUnit(spec.slug),
    );
    return {
      kind: 'keyword',
      id: `keyword:${term}`,
      term,
      description: `Invented definition of ${term}.`,
      frequency: units.length,
      firstYear: Math.min(...units.map((unit) => unit.year ?? Number.POSITIVE_INFINITY)),
      subjects: [...new Set(units.map((unit) => unit.subject))].sort(),
    };
  });
}

function sequences(): readonly GraphCorpusSequence[] {
  return THREADS.flatMap((thread) =>
    thread.sequences.map((sequence) => ({
      threadId: `thread:${thread.slug}` as const,
      subject: sequence.subject,
      placements: sequence.placements.map(([unitSlug, year]) => ({
        unitId: `unit:${unitSlug}` as const,
        year,
      })),
    })),
  );
}

function unitLessonRuns(): readonly GraphCorpusUnitLessonRun[] {
  return UNITS.map((unit) => ({
    unitId: `unit:${unit.slug}`,
    lessonIds: unit.lessons.map((slug) => `lesson:${slug}` as const),
  }));
}

function edges(): readonly GraphCorpusEdge[] {
  const containsUnit = THREADS.flatMap((thread) =>
    [...new Set(thread.sequences.flatMap((s) => s.placements.map(([slug]) => slug)))].map(
      (unitSlug): GraphCorpusEdge => ({
        source: `thread:${thread.slug}`,
        type: 'containsUnit',
        target: `unit:${unitSlug}`,
      }),
    ),
  );
  const containsLesson = UNITS.flatMap((unit) =>
    unit.lessons.map((lessonSlug): GraphCorpusEdge => ({
      source: `unit:${unit.slug}`,
      type: 'containsLesson',
      target: `lesson:${lessonSlug}`,
    })),
  );
  const addressesMisconception = LESSONS.flatMap((lesson) =>
    misconceptionNodes(lesson).map((node): GraphCorpusEdge => ({
      source: `lesson:${lesson.slug}`,
      type: 'addressesMisconception',
      target: node.id,
    })),
  );
  const containsKeyword = LESSONS.flatMap((lesson) =>
    lesson.keywords.map((term): GraphCorpusEdge => ({
      source: `lesson:${lesson.slug}`,
      type: 'containsKeyword',
      target: `keyword:${term}`,
    })),
  );
  const prerequisiteFor: GraphCorpusEdge = {
    source: 'unit:unit-c',
    type: 'prerequisiteFor',
    target: 'unit:unit-a',
  };
  return [
    ...containsUnit,
    ...containsLesson,
    ...addressesMisconception,
    ...containsKeyword,
    prerequisiteFor,
  ];
}

function buildFixtureCorpus(): GraphCorpus {
  const nodes = [
    ...THREADS.map(threadNode),
    ...UNITS.map(unitNode),
    ...LESSONS.map(lessonNode),
    ...LESSONS.flatMap(misconceptionNodes),
    ...keywordNodes(),
  ];
  const corpusEdges = edges();
  const count = (kind: string): number => nodes.filter((node) => node.kind === kind).length;
  const countEdges = (type: string): number =>
    corpusEdges.filter((edge) => edge.type === type).length;
  return {
    version: 'fixture',
    generatedAt: '2026-01-01T00:00:00.000Z',
    sourceVersion: 'fixture',
    stats: {
      totalNodes: nodes.length,
      totalEdges: corpusEdges.length,
      nodeKindCounts: {
        unit: count('unit'),
        thread: count('thread'),
        lesson: count('lesson'),
        misconception: count('misconception'),
        keyword: count('keyword'),
      },
      edgeTypeCounts: {
        prerequisiteFor: countEdges('prerequisiteFor'),
        containsUnit: countEdges('containsUnit'),
        containsLesson: countEdges('containsLesson'),
        addressesMisconception: countEdges('addressesMisconception'),
        containsKeyword: countEdges('containsKeyword'),
      },
      subjectsCovered: ['maths', 'science'],
      selfLoops: 0,
      collapsedIdenticalMisconceptions: 0,
      collapsedIdenticalPlacements: 0,
      collapsedIdenticalPrerequisiteEdges: 0,
      unitsWithoutAuthoredLessonOrder: 0,
    },
    nodes,
    edges: corpusEdges,
    sequences: sequences(),
    unitLessonRuns: unitLessonRuns(),
    droppedEdges: [],
    droppedDuplicates: [],
    seeAlso: 'fixture',
  };
}

export const fixtureCorpus: GraphCorpus = buildFixtureCorpus();

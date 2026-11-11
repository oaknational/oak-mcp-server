/**
 * Unit tests for bulk download Zod schemas
 *
 * @remarks
 * These tests validate that the Zod schemas correctly parse bulk download data,
 * including handling of data quality issues like NULL sentinel strings, and that
 * the strict gate rejects unknown keys and missing required fields.
 *
 * @see 07-bulk-download-data-quality-report.md for known data quality issues
 */
import { describe, expect, it } from 'vitest';
import type { z } from 'zod';

import {
  bulkDownloadFileSchema,
  lessonKeywordSchema,
  lessonSchema,
  nullSentinelSchema,
  unitLessonSchema,
  unitSchema,
  unitThreadSchema,
} from './index.js';

/** The pre-parse input shape (NULL sentinels not yet transformed) */
type LessonInput = z.input<typeof lessonSchema>;
type UnitInput = z.input<typeof unitSchema>;

describe('nullSentinelSchema', () => {
  it('transforms string "NULL" to null', () => {
    const result = nullSentinelSchema.parse('NULL');
    expect(result).toBeNull();
  });

  it('keeps null as null', () => {
    const result = nullSentinelSchema.parse(null);
    expect(result).toBeNull();
  });

  it('passes through regular strings', () => {
    const result = nullSentinelSchema.parse('Adult supervision required');
    expect(result).toBe('Adult supervision required');
  });
});

describe('lessonKeywordSchema', () => {
  it('parses a valid keyword with description', () => {
    const input = {
      keyword: 'photosynthesis',
      description: 'The process by which plants make food using sunlight.',
    };
    const result = lessonKeywordSchema.parse(input);
    expect(result).toEqual(input);
  });
});

describe('unitThreadSchema', () => {
  it('parses a valid thread', () => {
    const input = {
      slug: 'number-fractions',
      order: 9,
      title: 'Number: Fractions',
    };
    const result = unitThreadSchema.parse(input);
    expect(result).toEqual(input);
  });
});

describe('unitLessonSchema', () => {
  it('parses a valid unit lesson reference', () => {
    const input = {
      lessonSlug: 'adding-fractions-with-same-denominator',
      lessonTitle: 'Adding fractions with the same denominator',
      lessonOrder: 1,
      state: 'published',
    };
    const result = unitLessonSchema.parse(input);
    expect(result).toEqual(input);
  });
});

/** Creates a minimal valid lesson object for testing */
function createMinimalLesson(overrides: Partial<LessonInput> = {}): LessonInput {
  return {
    lessonTitle: 'Test Lesson',
    lessonSlug: 'test-lesson',
    oakUrl: 'https://www.thenational.academy/teachers/lessons/test-lesson',
    canonicalUrl:
      'https://www.thenational.academy/teachers/programmes/maths-primary-ks2/units/test-unit/lessons/test-lesson',
    unitSlug: 'test-unit',
    unitTitle: 'Test Unit',
    subjectSlug: 'maths',
    subjectTitle: 'Maths',
    keyStageSlug: 'ks2',
    keyStageTitle: 'Key Stage 2',
    lessonKeywords: [],
    keyLearningPoints: [],
    misconceptionsAndCommonMistakes: [],
    pupilLessonOutcome: 'I can learn.',
    teacherTips: [],
    contentGuidance: 'NULL',
    downloadsavailable: true,
    supervisionLevel: 'NULL',
    ...overrides,
  };
}

/** Creates a minimal valid unit object for testing */
function createMinimalUnit(overrides: Partial<UnitInput> = {}): UnitInput {
  return {
    unitSlug: 'test-unit',
    unitTitle: 'Test Unit',
    canonicalUrl:
      'https://www.thenational.academy/teachers/programmes/maths-primary-ks2/units/test-unit/lessons',
    subjectSlug: 'maths',
    threads: [],
    priorKnowledgeRequirements: [],
    nationalCurriculumContent: [],
    description: 'A test unit.',
    yearSlug: 'year-4',
    year: 4,
    keyStageSlug: 'ks2',
    unitLessons: [],
    ...overrides,
  };
}

describe('lessonSchema', () => {
  describe('transcript NULL sentinel handling', () => {
    it('transforms transcript_sentences NULL sentinel to null', () => {
      const input = createMinimalLesson({ transcript_sentences: 'NULL' });
      const result = lessonSchema.parse(input);
      expect(result.transcript_sentences).toBeNull();
    });

    it('transforms transcript_vtt NULL sentinel to null', () => {
      const input = createMinimalLesson({ transcript_vtt: 'NULL' });
      const result = lessonSchema.parse(input);
      expect(result.transcript_vtt).toBeNull();
    });

    it('preserves valid transcript_sentences', () => {
      const input = createMinimalLesson({ transcript_sentences: 'Hello and welcome...' });
      const result = lessonSchema.parse(input);
      expect(result.transcript_sentences).toBe('Hello and welcome...');
    });

    it('preserves valid transcript_vtt', () => {
      const input = createMinimalLesson({
        transcript_vtt: 'WEBVTT\n\n00:00:00.000 --> 00:00:05.000\nHello',
      });
      const result = lessonSchema.parse(input);
      expect(result.transcript_vtt).toBe('WEBVTT\n\n00:00:00.000 --> 00:00:05.000\nHello');
    });

    it('allows omitted transcript fields', () => {
      const input = createMinimalLesson();
      const result = lessonSchema.parse(input);
      expect(result.transcript_sentences).toBeUndefined();
      expect(result.transcript_vtt).toBeUndefined();
      expect(result.restricted).toBeUndefined();
    });
  });

  describe('restricted flag', () => {
    // Upstream declares restricted as a plain boolean; the data only ever emits
    // true (restricted lessons also carry no transcripts), but the gate's
    // contract is the declared schema, not the sample.
    it.each([true, false])('round-trips restricted: %s without transcripts', (value) => {
      const input = createMinimalLesson({ restricted: value });
      const result = lessonSchema.parse(input);
      expect(result.restricted).toBe(value);
    });
  });

  it('parses a lesson with NULL sentinel for contentGuidance', () => {
    const input = createMinimalLesson({
      lessonTitle: 'Adding fractions',
      lessonSlug: 'adding-fractions',
      oakUrl: 'https://www.thenational.academy/teachers/lessons/adding-fractions',
      canonicalUrl:
        'https://www.thenational.academy/teachers/programmes/maths-primary-ks2/units/fractions-year-4/lessons/adding-fractions',
      unitSlug: 'fractions-year-4',
      unitTitle: 'Fractions Year 4',
      lessonKeywords: [{ keyword: 'fraction', description: 'Part of a whole' }],
      keyLearningPoints: [{ keyLearningPoint: 'Add fractions with same denominator' }],
      pupilLessonOutcome: 'I can add fractions.',
      transcript_sentences: 'Hello and welcome...',
    });

    const result = lessonSchema.parse(input);

    expect(result.contentGuidance).toBeNull();
    expect(result.supervisionLevel).toBeNull();
    expect(result.lessonSlug).toBe('adding-fractions');
  });

  it('parses a lesson with actual contentGuidance array', () => {
    const input = createMinimalLesson({
      lessonTitle: 'Sensitive topic lesson',
      lessonSlug: 'sensitive-topic',
      oakUrl: 'https://www.thenational.academy/teachers/lessons/sensitive-topic',
      canonicalUrl:
        'https://www.thenational.academy/teachers/programmes/science-secondary-ks3/units/unit-1/lessons/sensitive-topic',
      unitSlug: 'unit-1',
      unitTitle: 'Unit 1',
      subjectSlug: 'science',
      subjectTitle: 'Science',
      keyStageSlug: 'ks3',
      keyStageTitle: 'Key Stage 3',
      pupilLessonOutcome: 'I can understand.',
      contentGuidance: [
        {
          contentGuidanceArea: 'Physical activity',
          supervisionlevel_id: 3,
          contentGuidanceLabel: 'Risk assessment required',
          contentGuidanceDescription: 'Use of equipment requiring supervision.',
        },
      ],
      supervisionLevel: 'Adult supervision required',
      transcript_sentences: 'Welcome...',
    });

    const result = lessonSchema.parse(input);

    expect(result.contentGuidance).toHaveLength(1);
    expect(result.supervisionLevel).toBe('Adult supervision required');
  });

  it('rejects an unknown key', () => {
    const input = { ...createMinimalLesson(), zzzUnexpected: 'x' };
    const result = lessonSchema.safeParse(input);
    if (result.success) {
      throw new Error('expected the strict gate to reject the unknown key');
    }
    expect(result.error.issues[0]?.code).toBe('unrecognized_keys');
    expect(result.error.issues[0]).toMatchObject({ keys: ['zzzUnexpected'] });
  });

  it.each(['oakUrl', 'canonicalUrl'])('rejects a lesson missing required %s', (field) => {
    const input = Object.fromEntries(
      Object.entries(createMinimalLesson()).filter(([key]) => key !== field),
    );
    const result = lessonSchema.safeParse(input);
    if (result.success) {
      throw new Error(`expected the gate to reject a lesson missing ${field}`);
    }
    expect(
      result.error.issues.some((issue) => issue.code === 'invalid_type' && issue.path[0] === field),
    ).toBe(true);
  });
});

describe('unitSchema', () => {
  it('parses a valid unit with all fields', () => {
    const input = createMinimalUnit({
      unitSlug: 'fractions-year-4',
      unitTitle: 'Fractions Year 4',
      canonicalUrl:
        'https://www.thenational.academy/teachers/programmes/maths-primary-ks2/units/fractions-year-4/lessons',
      threads: [{ slug: 'number-fractions', order: 9, title: 'Number: Fractions' }],
      priorKnowledgeRequirements: ['Understand equal parts'],
      nationalCurriculumContent: ['Recognise and show fractions'],
      description: 'In this unit pupils learn about fractions.',
      whyThisWhyNow: 'Builds on Year 3 fraction knowledge.',
      unitLessons: [
        {
          lessonSlug: 'what-is-a-fraction',
          lessonTitle: 'What is a fraction?',
          lessonOrder: 1,
          state: 'published',
        },
      ],
    });

    const result = unitSchema.parse(input);

    expect(result.unitSlug).toBe('fractions-year-4');
    expect(result.threads).toHaveLength(1);
    expect(result.unitLessons).toHaveLength(1);
  });

  it('parses a unit with empty threads array', () => {
    const input = createMinimalUnit({
      unitSlug: 'special-unit',
      unitTitle: 'Special Unit',
      description: '',
      yearSlug: 'year-10',
      year: 10,
      keyStageSlug: 'ks4',
      whyThisWhyNow: '',
    });

    const result = unitSchema.parse(input);
    expect(result.threads).toEqual([]);
  });

  it('round-trips a fully-optioned KS4 unit', () => {
    const input = createMinimalUnit({
      unitSlug: 'energy-transfers',
      unitTitle: 'Energy transfers',
      canonicalUrl:
        'https://www.thenational.academy/teachers/programmes/combined-science-secondary-ks4/units/energy-transfers/lessons',
      subjectSlug: 'combined-science',
      yearSlug: 'year-10',
      year: 10,
      keyStageSlug: 'ks4',
      examBoard: { slug: 'aqa', title: 'AQA' },
      tier: { tierSlug: 'higher', tierTitle: 'Higher' },
      pathway: 'GCSE',
      pathwaySlug: 'gcse',
      unitOptionGroup: 'energy-transfers-option-a',
      examSubjects: [{ examSubjectSlug: 'combined-science', examSubjectTitle: 'Combined Science' }],
      categories: [{ categoryTitle: 'Physics', categorySlug: 'physics' }],
      programmeFactors: {
        examBoard: { slug: 'aqa', title: 'AQA' },
        tier: { slug: 'higher', title: 'Higher' },
      },
    });

    const result = unitSchema.parse(input);

    expect(result).toEqual(input);
  });

  it('parses a real-shape swimming unit with empty canonicalUrl and string year', () => {
    // physical-education-primary.json carries four swimming units with
    // canonicalUrl: "" and year: "All years" — the gate transcribes the
    // declared string type, not a URL refinement.
    const input = createMinimalUnit({
      unitSlug: 'swimming-and-water-safety-1',
      unitTitle: 'Swimming and water safety',
      canonicalUrl: '',
      subjectSlug: 'physical-education',
      yearSlug: 'all-years',
      year: 'All years',
    });

    const result = unitSchema.parse(input);

    expect(result.canonicalUrl).toBe('');
    expect(result.year).toBe('All years');
  });

  it('rejects an unknown key', () => {
    const input = { ...createMinimalUnit(), zzzUnexpected: 'x' };
    const result = unitSchema.safeParse(input);
    if (result.success) {
      throw new Error('expected the strict gate to reject the unknown key');
    }
    expect(result.error.issues[0]?.code).toBe('unrecognized_keys');
    expect(result.error.issues[0]).toMatchObject({ keys: ['zzzUnexpected'] });
  });

  it('rejects the retired plural examBoards key', () => {
    // June-era data carried examBoards (plural); upstream migrated to the
    // singular examBoard + examSubjects. The plural must stay rejected.
    const input = { ...createMinimalUnit(), examBoards: [{ slug: 'aqa', title: 'AQA' }] };
    const result = unitSchema.safeParse(input);
    if (result.success) {
      throw new Error('expected the gate to reject the retired examBoards key');
    }
    expect(result.error.issues[0]?.code).toBe('unrecognized_keys');
    expect(result.error.issues[0]).toMatchObject({ keys: ['examBoards'] });
  });

  it('rejects an unknown programme factor key', () => {
    const input = {
      ...createMinimalUnit(),
      programmeFactors: {
        examBoard: { slug: 'aqa', title: 'AQA' },
        notAFactor: { slug: 'x', title: 'X' },
      },
    };
    const result = unitSchema.safeParse(input);
    if (result.success) {
      throw new Error('expected the gate to reject the unknown programme factor');
    }
    expect(
      result.error.issues.some(
        (issue) => issue.code === 'unrecognized_keys' && issue.path[0] === 'programmeFactors',
      ),
    ).toBe(true);
  });

  it.each(['canonicalUrl', 'subjectSlug'])('rejects a unit missing required %s', (field) => {
    const input = Object.fromEntries(
      Object.entries(createMinimalUnit()).filter(([key]) => key !== field),
    );
    const result = unitSchema.safeParse(input);
    if (result.success) {
      throw new Error(`expected the gate to reject a unit missing ${field}`);
    }
    expect(
      result.error.issues.some((issue) => issue.code === 'invalid_type' && issue.path[0] === field),
    ).toBe(true);
  });
});

describe('bulkDownloadFileSchema', () => {
  it('parses a minimal bulk download file', () => {
    const input = {
      sequenceSlug: 'maths-primary',
      subjectTitle: 'Maths',
      sequence: [],
      lessons: [],
    };

    const result = bulkDownloadFileSchema.parse(input);

    expect(result.sequenceSlug).toBe('maths-primary');
    expect(result.subjectTitle).toBe('Maths');
    expect(result.sequence).toEqual([]);
    expect(result.lessons).toEqual([]);
  });
});

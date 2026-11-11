/**
 * Unit tests for response augmentation slug/generic-ID extraction functions.
 *
 * These are pure functions with no IO — direct unit tests.
 */

import { describe, it, expect } from 'vitest';
import {
  extractGenericId,
  extractSubjectSlug,
  extractLessonSlug,
  extractUnitSlug,
  extractSequenceSlug,
  extractThreadSlug,
  extractContentTypeSpecificId,
} from './response-augmentation-slug-extraction.js';

describe('extractGenericId', () => {
  it('extracts slug from object', () => {
    expect(extractGenericId({ slug: 'test' })).toBe('test');
  });

  it('extracts id from object', () => {
    expect(extractGenericId({ id: 'test-id' })).toBe('test-id');
  });

  it('prefers slug over id', () => {
    expect(extractGenericId({ slug: 'slug-val', id: 'id-val' })).toBe('slug-val');
  });

  it('returns undefined for non-object', () => {
    expect(extractGenericId(42)).toBeUndefined();
  });

  it('returns undefined for null', () => {
    expect(extractGenericId(null)).toBeUndefined();
  });
});

describe('extractSubjectSlug', () => {
  it('extracts subjectSlug from object', () => {
    expect(extractSubjectSlug({ subjectSlug: 'maths' })).toBe('maths');
  });

  it('returns undefined for non-object', () => {
    expect(extractSubjectSlug(42)).toBeUndefined();
  });

  it('returns undefined for null', () => {
    expect(extractSubjectSlug(null)).toBeUndefined();
  });
});

describe('extractLessonSlug', () => {
  it('extracts lessonSlug from object', () => {
    expect(extractLessonSlug({ lessonSlug: 'add-fractions' })).toBe('add-fractions');
  });

  it('returns undefined for non-object', () => {
    expect(extractLessonSlug(42)).toBeUndefined();
  });
});

describe('extractUnitSlug', () => {
  it('extracts unitSlug from object', () => {
    expect(extractUnitSlug({ unitSlug: 'fractions' })).toBe('fractions');
  });

  it('returns undefined for non-object', () => {
    expect(extractUnitSlug(42)).toBeUndefined();
  });

  it('returns undefined for a lesson resource without a top-level unitSlug', () => {
    const lessonResource = {
      units: [{ unitSlug: 'fractions', unitTitle: 'Fractions' }],
    };
    expect(extractUnitSlug(lessonResource)).toBeUndefined();
  });
});

describe('extractSequenceSlug', () => {
  it('extracts sequenceSlug from object', () => {
    expect(extractSequenceSlug({ sequenceSlug: 'maths-ks1' })).toBe('maths-ks1');
  });

  it('returns undefined for non-object', () => {
    expect(extractSequenceSlug(42)).toBeUndefined();
  });
});

describe('extractThreadSlug', () => {
  it('extracts threadSlug from object', () => {
    expect(extractThreadSlug({ threadSlug: 'algebra' })).toBe('algebra');
  });

  it('returns undefined for non-object', () => {
    expect(extractThreadSlug(42)).toBeUndefined();
  });
});

describe('extractContentTypeSpecificId', () => {
  it('extracts lessonSlug for lesson type', () => {
    expect(extractContentTypeSpecificId({ lessonSlug: 'test' }, 'lesson')).toBe('test');
  });

  it('extracts unitSlug for unit type', () => {
    expect(extractContentTypeSpecificId({ unitSlug: 'test' }, 'unit')).toBe('test');
  });

  it('extracts subjectSlug for subject type', () => {
    expect(extractContentTypeSpecificId({ subjectSlug: 'test' }, 'subject')).toBe('test');
  });

  it('extracts sequenceSlug for sequence type', () => {
    expect(extractContentTypeSpecificId({ sequenceSlug: 'test' }, 'sequence')).toBe('test');
  });

  it('extracts threadSlug for thread type', () => {
    expect(extractContentTypeSpecificId({ threadSlug: 'test' }, 'thread')).toBe('test');
  });

  it('returns undefined for undefined content type', () => {
    expect(extractContentTypeSpecificId({ slug: 'test' }, undefined)).toBeUndefined();
  });
});

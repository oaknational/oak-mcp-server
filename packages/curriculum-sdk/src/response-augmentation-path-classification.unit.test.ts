/**
 * Unit tests for response augmentation path-classification functions.
 *
 * These are pure functions with no IO — direct unit tests.
 */

import { describe, it, expect } from 'vitest';
import {
  isSingleEntityEndpoint,
  isSearchEndpoint,
  isKeyStageScopedEndpoint,
  getContentTypeFromPath,
  extractEntityIdFromPath,
} from './response-augmentation-path-classification.js';

describe('isSingleEntityEndpoint', () => {
  describe('subject paths', () => {
    it('returns subject for /subjects/{s}', () => {
      expect(isSingleEntityEndpoint('/subjects/maths')).toBe('subject');
    });

    it('returns undefined for /subjects/{s}/key-stages (Snag 3)', () => {
      expect(isSingleEntityEndpoint('/subjects/maths/key-stages')).toBeUndefined();
    });

    it('returns undefined for /subjects/{s}/years (Snag 4)', () => {
      expect(isSingleEntityEndpoint('/subjects/maths/years')).toBeUndefined();
    });
  });

  describe('sequence paths', () => {
    it('returns sequence for /sequences/{s}', () => {
      expect(isSingleEntityEndpoint('/sequences/maths-ks1')).toBe('sequence');
    });

    it('returns sequence for /sequences/{s}/units', () => {
      expect(isSingleEntityEndpoint('/sequences/maths-secondary/units')).toBe('sequence');
    });

    it('returns undefined for a path that merely ends with /sequences', () => {
      expect(isSingleEntityEndpoint('/subjects/maths/sequences')).toBeUndefined();
    });
  });

  describe('lesson paths', () => {
    it('returns lesson for /lessons/{l}', () => {
      expect(isSingleEntityEndpoint('/lessons/add-fractions')).toBe('lesson');
    });

    it('returns lesson for /lessons/{l}/summary', () => {
      expect(isSingleEntityEndpoint('/lessons/add-fractions/summary')).toBe('lesson');
    });

    it('returns lesson for /lessons/{l}/transcript', () => {
      expect(isSingleEntityEndpoint('/lessons/add-fractions/transcript')).toBe('lesson');
    });
  });

  describe('unit paths', () => {
    it('returns unit for /units/{u}', () => {
      expect(isSingleEntityEndpoint('/units/fractions')).toBe('unit');
    });

    it('returns unit for /units/{u}/summary', () => {
      expect(isSingleEntityEndpoint('/units/fractions/summary')).toBe('unit');
    });
  });

  describe('thread paths', () => {
    it('returns thread for /threads/{t}', () => {
      expect(isSingleEntityEndpoint('/threads/algebra')).toBe('thread');
    });
  });

  describe('unrecognised paths', () => {
    it('returns undefined for /unknown/path', () => {
      expect(isSingleEntityEndpoint('/unknown/path')).toBeUndefined();
    });
  });
});

describe('isSearchEndpoint', () => {
  it('returns lesson for /search/lessons', () => {
    expect(isSearchEndpoint('/search/lessons')).toBe('lesson');
  });

  it('returns lesson for /search/transcripts', () => {
    expect(isSearchEndpoint('/search/transcripts')).toBe('lesson');
  });

  it('returns undefined for /search/units', () => {
    expect(isSearchEndpoint('/search/units')).toBeUndefined();
  });

  it('returns undefined for non-search paths', () => {
    expect(isSearchEndpoint('/lessons/test')).toBeUndefined();
  });
});

describe('isKeyStageScopedEndpoint', () => {
  it('returns lesson for /key-stages/{ks}/subjects/{s}/lessons', () => {
    expect(isKeyStageScopedEndpoint('/key-stages/ks3/subjects/science/lessons')).toBe('lesson');
  });

  it('returns unit for /key-stages/{ks}/subjects/{s}/units', () => {
    expect(isKeyStageScopedEndpoint('/key-stages/ks2/subjects/maths/units')).toBe('unit');
  });

  it('returns undefined for paths without key-stages', () => {
    expect(isKeyStageScopedEndpoint('/subjects/maths/lessons')).toBeUndefined();
  });

  it('returns undefined for paths without subjects', () => {
    expect(isKeyStageScopedEndpoint('/key-stages/ks3/lessons')).toBeUndefined();
  });
});

describe('getContentTypeFromPath', () => {
  it('returns subject for /subjects/{s}', () => {
    expect(getContentTypeFromPath('/subjects/maths')).toBe('subject');
  });

  it('returns undefined for /subjects/{s}/key-stages (Snag 3)', () => {
    expect(getContentTypeFromPath('/subjects/maths/key-stages')).toBeUndefined();
  });

  it('returns undefined for /subjects/{s}/years (Snag 4)', () => {
    expect(getContentTypeFromPath('/subjects/maths/years')).toBeUndefined();
  });

  it('returns lesson for /search/lessons', () => {
    expect(getContentTypeFromPath('/search/lessons')).toBe('lesson');
  });

  it('returns lesson for key-stage scoped lessons', () => {
    expect(getContentTypeFromPath('/key-stages/ks3/subjects/science/lessons')).toBe('lesson');
  });

  it('returns unit for key-stage scoped units', () => {
    expect(getContentTypeFromPath('/key-stages/ks2/subjects/maths/units')).toBe('unit');
  });

  it('returns sequence for /sequences/{slug}', () => {
    expect(getContentTypeFromPath('/sequences/science-secondary-aqa')).toBe('sequence');
  });
});

describe('extractEntityIdFromPath', () => {
  it('extracts lesson slug from lesson sub-resource paths', () => {
    expect(extractEntityIdFromPath('/lessons/add-fractions/summary', 'lesson')).toBe(
      'add-fractions',
    );
  });

  it('extracts unit slug from unit sub-resource paths', () => {
    expect(extractEntityIdFromPath('/units/fractions/summary', 'unit')).toBe('fractions');
  });

  it('extracts subject slug from subject paths', () => {
    expect(extractEntityIdFromPath('/subjects/maths', 'subject')).toBe('maths');
  });

  it('extracts sequence slug from sequence paths', () => {
    expect(extractEntityIdFromPath('/sequences/maths-ks1', 'sequence')).toBe('maths-ks1');
  });

  it('extracts thread slug from thread paths', () => {
    expect(extractEntityIdFromPath('/threads/algebra', 'thread')).toBe('algebra');
  });

  it('returns undefined for OpenAPI template placeholders', () => {
    expect(extractEntityIdFromPath('/lessons/{lesson}/summary', 'lesson')).toBeUndefined();
  });

  it('returns undefined when the path does not match the content type', () => {
    expect(extractEntityIdFromPath('/subjects/maths', 'lesson')).toBeUndefined();
  });
});

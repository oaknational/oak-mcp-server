/**
 * Unit tests for `validateDownloadAssetArgs` — a pure function, no fakes.
 * The dependency-integrating `runDownloadAssetTool` behaviour lives in
 * `execution.integration.test.ts`.
 */
import { describe, it, expect } from 'vitest';
import { validateDownloadAssetArgs } from './execution.js';

describe('validateDownloadAssetArgs', () => {
  it('accepts valid lesson and type', () => {
    const result = validateDownloadAssetArgs({ lesson: 'my-lesson', type: 'worksheet' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ lesson: 'my-lesson', type: 'worksheet' });
    }
  });

  it('rejects missing lesson', () => {
    const result = validateDownloadAssetArgs({ type: 'worksheet' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('lesson');
    }
  });

  it('rejects missing type', () => {
    const result = validateDownloadAssetArgs({ lesson: 'my-lesson' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('type');
    }
  });

  it('rejects invalid asset type', () => {
    const result = validateDownloadAssetArgs({ lesson: 'my-lesson', type: 'notAType' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('type');
    }
  });

  it('rejects empty lesson string', () => {
    const result = validateDownloadAssetArgs({ lesson: '', type: 'worksheet' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('lesson');
    }
  });

  it('rejects non-object input', () => {
    const result = validateDownloadAssetArgs('not-an-object');

    expect(result.ok).toBe(false);
  });

  it('rejects null input', () => {
    const result = validateDownloadAssetArgs(null);

    expect(result.ok).toBe(false);
  });
});

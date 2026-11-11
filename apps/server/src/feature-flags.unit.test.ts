/**
 * Unit tests for the feature-flag resolution engine.
 *
 * These prove the engine's two postures resolve an optional env value to a
 * boolean correctly. They are deliberately flag-agnostic: which flag uses which
 * posture, and any flag's configured default, are configuration set at the call
 * site and are not re-tested here (testing-strategy: assert the mechanism, not
 * configuration collections).
 */

import { describe, expect, it } from 'vitest';

import { resolveOptInFlag } from './feature-flags.js';

describe('resolveOptInFlag — default OFF', () => {
  it('is enabled only on an explicit "true"', () => {
    expect(resolveOptInFlag('true')).toBe(true);
  });

  it('is disabled when unset', () => {
    expect(resolveOptInFlag(undefined)).toBe(false);
  });

  it('is disabled on an explicit "false"', () => {
    expect(resolveOptInFlag('false')).toBe(false);
  });
});

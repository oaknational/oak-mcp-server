/**
 * Contract pin for the canonical verified-userId derivation.
 *
 * This helper exists to be adopted by every consumer of the auth-identity
 * shape — including one whose behaviour its adoption will deliberately
 * change — so its contract is pinned here independently of any single
 * consumer's paths.
 */

import { describe, expect, it } from 'vitest';

import { createFakeAuthInfo } from '../../test-helpers/fakes.js';
import { verifiedUserIdFrom } from './verified-user-id.js';

describe('verifiedUserIdFrom', () => {
  it('returns the non-empty verified userId', () => {
    expect(verifiedUserIdFrom(createFakeAuthInfo())).toBe('user_123');
  });

  it('returns undefined when auth context is absent', () => {
    expect(verifiedUserIdFrom(undefined)).toBeUndefined();
  });

  it('returns undefined when the auth extra carries no userId', () => {
    expect(verifiedUserIdFrom(createFakeAuthInfo({ extra: {} }))).toBeUndefined();
  });

  it('collapses an empty-string userId to undefined', () => {
    expect(verifiedUserIdFrom(createFakeAuthInfo({ extra: { userId: '' } }))).toBeUndefined();
  });

  it('treats a non-string userId as absent', () => {
    expect(verifiedUserIdFrom(createFakeAuthInfo({ extra: { userId: 42 } }))).toBeUndefined();
  });
});

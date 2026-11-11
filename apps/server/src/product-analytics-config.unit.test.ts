import { describe, it, expect } from 'vitest';
import {
  resolveProductAnalyticsConfig,
  type ProductAnalyticsBootstrap,
} from './product-analytics-config.js';

const ZERO_KEY_BASE64URL = Buffer.alloc(32, 0).toString('base64url');
const ONE_KEY_BASE64URL = Buffer.alloc(32, 1).toString('base64url');

const validKeyring = JSON.stringify([{ id: 'k2026_01', key: ZERO_KEY_BASE64URL }]);

const selectedEnv = {
  OBSERVABILITY_SINKS: ['sentry', 'posthog'] as const,
  POSTHOG_PROJECT_API_KEY: 'phc_test_project_key',
  POSTHOG_HOST: 'https://eu.i.posthog.com',
  POSTHOG_PSEUDONYM_ACTIVE_KEY_ID: 'k2026_01',
  POSTHOG_PSEUDONYM_KEYRING: validKeyring,
};

function assertSelected(
  bootstrap: ProductAnalyticsBootstrap,
): asserts bootstrap is Extract<ProductAnalyticsBootstrap, { selected: true }> {
  expect(bootstrap.selected).toBe(true);
}

describe('resolveProductAnalyticsConfig — off mode', () => {
  it('returns an unselected bootstrap when posthog is not in the selection', () => {
    const result = resolveProductAnalyticsConfig({
      OBSERVABILITY_SINKS: ['sentry'],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ selected: false });
    }
  });

  it('ignores PostHog variables entirely when posthog is not selected', () => {
    const result = resolveProductAnalyticsConfig({
      OBSERVABILITY_SINKS: [],
      POSTHOG_PROJECT_API_KEY: '',
      POSTHOG_PSEUDONYM_ACTIVE_KEY_ID: 'missing-from-ring',
      POSTHOG_PSEUDONYM_KEYRING: 'not even json',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ selected: false });
    }
  });
});

describe('resolveProductAnalyticsConfig — selected mode', () => {
  it('produces the closed bootstrap value from a complete valid configuration', () => {
    const result = resolveProductAnalyticsConfig(selectedEnv);

    expect(result.ok).toBe(true);
    if (result.ok) {
      assertSelected(result.value);
      const bootstrap = result.value;
      expect(bootstrap.projectApiKey).toBe('phc_test_project_key');
      expect(bootstrap.host).toBe('https://eu.i.posthog.com');
      expect(bootstrap.activeKeyId).toBe('k2026_01');
      expect(bootstrap.keyring).toHaveLength(1);
      expect(bootstrap.keyring[0]?.id).toBe('k2026_01');
      expect(bootstrap.keyring[0]?.key).toBeInstanceOf(Uint8Array);
      expect(bootstrap.keyring[0]?.key).toHaveLength(32);
      expect([...(bootstrap.keyring[0]?.key ?? [])].every((byte) => byte === 0)).toBe(true);
    }
  });

  it('backs each returned key with its own exactly-sized store, never a shared Buffer pool', () => {
    const result = resolveProductAnalyticsConfig(selectedEnv);
    expect(result.ok).toBe(true);
    if (result.ok) {
      assertSelected(result.value);
      // A pooled Node Buffer exposes a ~64KiB shared backing store through
      // `.buffer`; a consumer reading it would see unrelated pooled memory,
      // including sibling ring keys. The copy's store is exactly 32 bytes.
      expect(result.value.keyring[0]?.key.buffer.byteLength).toBe(32);
    }
  });

  it('accepts a multi-key ring, decoding each entry to its own material in order', () => {
    const result = resolveProductAnalyticsConfig({
      ...selectedEnv,
      POSTHOG_PSEUDONYM_KEYRING: JSON.stringify([
        { id: 'k2026_01', key: ZERO_KEY_BASE64URL },
        { id: 'k2026_02', key: ONE_KEY_BASE64URL },
      ]),
      POSTHOG_PSEUDONYM_ACTIVE_KEY_ID: 'k2026_02',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      assertSelected(result.value);
      const bootstrap = result.value;
      expect(bootstrap.activeKeyId).toBe('k2026_02');
      expect(bootstrap.keyring.map((entry) => entry.id)).toEqual(['k2026_01', 'k2026_02']);
      expect([...(bootstrap.keyring[0]?.key ?? [])].every((byte) => byte === 0)).toBe(true);
      expect([...(bootstrap.keyring[1]?.key ?? [])].every((byte) => byte === 1)).toBe(true);
    }
  });
});

describe('resolveProductAnalyticsConfig — selected-mode rejections', () => {
  it.each([
    [
      'a missing project key',
      { ...selectedEnv, POSTHOG_PROJECT_API_KEY: undefined },
      'project API key is required',
    ],
    [
      'an empty project key',
      { ...selectedEnv, POSTHOG_PROJECT_API_KEY: '' },
      'project API key is required',
    ],
    [
      'a missing host',
      { ...selectedEnv, POSTHOG_HOST: undefined },
      'host must be the exact EU ingestion host',
    ],
    [
      'a non-EU host',
      { ...selectedEnv, POSTHOG_HOST: 'https://us.i.posthog.com' },
      'host must be the exact EU ingestion host',
    ],
    [
      'a missing active key id',
      { ...selectedEnv, POSTHOG_PSEUDONYM_ACTIVE_KEY_ID: undefined },
      'active pseudonym key id is required',
    ],
    [
      'an empty active key id',
      { ...selectedEnv, POSTHOG_PSEUDONYM_ACTIVE_KEY_ID: '' },
      'active pseudonym key id is required',
    ],
    [
      'a missing keyring',
      { ...selectedEnv, POSTHOG_PSEUDONYM_KEYRING: undefined },
      'pseudonym keyring is required',
    ],
  ])('rejects %s with its own rule', (_label, env, discriminator) => {
    const result = resolveProductAnalyticsConfig(env);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain(discriminator);
    }
  });

  // Every ring below carries the selected active id (k2026_01) where its
  // shape allows one, so the ACTIVE-ID rule cannot mask the keyring rule
  // under test; the discriminator assertion pins which rule fired.
  it.each([
    ['malformed JSON', 'not json'],
    [
      'a JSON object rather than an array',
      JSON.stringify({ id: 'k2026_01', key: ZERO_KEY_BASE64URL }),
    ],
    ['an empty array', '[]'],
    [
      'a record with unknown fields',
      JSON.stringify([{ id: 'k2026_01', key: ZERO_KEY_BASE64URL, extra: true }]),
    ],
    ['a record missing the key field', JSON.stringify([{ id: 'k2026_01' }])],
    ['a record with a non-string id', JSON.stringify([{ id: 7, key: ZERO_KEY_BASE64URL }])],
    ['an empty id', JSON.stringify([{ id: '', key: ZERO_KEY_BASE64URL }])],
    [
      'an id outside the adapter key-id contract (uppercase)',
      JSON.stringify([{ id: 'K2026_01', key: ZERO_KEY_BASE64URL }]),
    ],
    [
      'an id outside the adapter key-id contract (leading separator)',
      JSON.stringify([{ id: '-k2026', key: ZERO_KEY_BASE64URL }]),
    ],
    [
      'an id outside the adapter key-id contract (33 characters)',
      JSON.stringify([{ id: `k${'a'.repeat(32)}`, key: ZERO_KEY_BASE64URL }]),
    ],
    [
      'duplicate ids',
      JSON.stringify([
        { id: 'k2026_01', key: ZERO_KEY_BASE64URL },
        { id: 'k2026_01', key: ONE_KEY_BASE64URL },
      ]),
    ],
    [
      'duplicate key material under distinct ids',
      JSON.stringify([
        { id: 'k2026_01', key: ZERO_KEY_BASE64URL },
        { id: 'k2', key: ZERO_KEY_BASE64URL },
      ]),
    ],
    [
      'padded base64',
      JSON.stringify([{ id: 'k2026_01', key: Buffer.alloc(32, 0).toString('base64') }]),
    ],
    [
      'a non-canonical encoding that decodes to the same bytes',
      JSON.stringify([{ id: 'k2026_01', key: `${ZERO_KEY_BASE64URL.slice(0, 42)}B` }]),
    ],
    [
      'key material shorter than 32 bytes',
      JSON.stringify([{ id: 'k2026_01', key: Buffer.alloc(31, 0).toString('base64url') }]),
    ],
    [
      'key material longer than 32 bytes',
      JSON.stringify([{ id: 'k2026_01', key: Buffer.alloc(33, 0).toString('base64url') }]),
    ],
  ])('rejects a keyring with %s via the keyring rule itself', (_label, keyring) => {
    const result = resolveProductAnalyticsConfig({
      ...selectedEnv,
      POSTHOG_PSEUDONYM_KEYRING: keyring,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('pseudonym keyring failed strict validation');
    }
  });

  it('rejects an active key id that resolves no keyring entry', () => {
    const result = resolveProductAnalyticsConfig({
      ...selectedEnv,
      POSTHOG_PSEUDONYM_ACTIVE_KEY_ID: 'k_absent',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('resolves no keyring entry');
    }
  });

  it('never includes supplied values in a failure — no key material, no api key, no raw keyring', () => {
    const failures = [
      resolveProductAnalyticsConfig({ ...selectedEnv, POSTHOG_PSEUDONYM_KEYRING: 'not json' }),
      resolveProductAnalyticsConfig({
        ...selectedEnv,
        POSTHOG_PSEUDONYM_KEYRING: JSON.stringify([{ id: 'k1', key: 'short' }]),
      }),
      resolveProductAnalyticsConfig({ ...selectedEnv, POSTHOG_HOST: 'https://us.i.posthog.com' }),
      resolveProductAnalyticsConfig({
        ...selectedEnv,
        POSTHOG_PSEUDONYM_ACTIVE_KEY_ID: 'k_absent',
      }),
    ];

    for (const result of failures) {
      expect(result.ok).toBe(false);
      if (!result.ok) {
        const serialised = JSON.stringify(result.error);
        expect(serialised).not.toContain(ZERO_KEY_BASE64URL);
        expect(serialised).not.toContain('phc_test_project_key');
        expect(serialised).not.toContain('us.i.posthog.com');
        expect(serialised).not.toContain('k_absent');
        expect(serialised).not.toContain('short');
      }
    }
  });
});

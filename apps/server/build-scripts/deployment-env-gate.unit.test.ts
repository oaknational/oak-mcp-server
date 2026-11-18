import { describe, expect, it } from 'vitest';
import { assertDeploymentEnvValid, isVercelBuild } from './deployment-env-gate.js';

const VALID_ZERO_KEY = Buffer.alloc(32, 0).toString('base64url');

// Shape of the original MCP-691 incident: a deployment with `posthog`
// selected but a keyring that fails the adapter's strict decode (here, one
// byte short of the required 32-byte key material).
const MALFORMED_POSTHOG_KEYRING_ENV = {
  OAK_API_KEY: 'test-api-key',
  ELASTICSEARCH_URL: 'https://example-elasticsearch.test',
  ELASTICSEARCH_API_KEY: 'test-es-key',
  CLERK_PUBLISHABLE_KEY: 'pk_test_123',
  CLERK_SECRET_KEY: 'sk_test_123',
  SENTRY_MODE: 'sentry',
  SENTRY_DSN: 'https://public@localhost/123456',
  OBSERVABILITY_SINKS: '["sentry","posthog"]',
  POSTHOG_PROJECT_API_KEY: 'phc_test_project_key',
  POSTHOG_HOST: 'https://eu.i.posthog.com',
  POSTHOG_PSEUDONYM_ACTIVE_KEY_ID: 'k2026_01',
  POSTHOG_PSEUDONYM_KEYRING: JSON.stringify([
    { id: 'k2026_01', key: Buffer.alloc(31, 0).toString('base64url') },
  ]),
};

const VALID_POSTHOG_ENV = {
  ...MALFORMED_POSTHOG_KEYRING_ENV,
  POSTHOG_PSEUDONYM_KEYRING: JSON.stringify([{ id: 'k2026_01', key: VALID_ZERO_KEY }]),
};

const startDir = import.meta.dirname;

describe('isVercelBuild', () => {
  it('is false when VERCEL is unset — local and CI pnpm build runs', () => {
    expect(isVercelBuild({})).toBe(false);
  });

  it('is false for any value other than the exact string "1"', () => {
    expect(isVercelBuild({ VERCEL: 'true' })).toBe(false);
  });

  it('is true when VERCEL=1 — the system env var Vercel sets during build', () => {
    expect(isVercelBuild({ VERCEL: '1' })).toBe(true);
  });
});

describe('assertDeploymentEnvValid', () => {
  it('does not throw when VERCEL is unset, even with a malformed deployment env', () => {
    expect(() =>
      assertDeploymentEnvValid({ processEnv: MALFORMED_POSTHOG_KEYRING_ENV, startDir }),
    ).not.toThrow();
  });

  it('throws on the original incident shape when VERCEL=1', () => {
    expect(() =>
      assertDeploymentEnvValid({
        processEnv: { ...MALFORMED_POSTHOG_KEYRING_ENV, VERCEL: '1' },
        startDir,
      }),
    ).toThrow();
  });

  it('never echoes the supplied keyring value in the thrown message', () => {
    try {
      assertDeploymentEnvValid({
        processEnv: { ...MALFORMED_POSTHOG_KEYRING_ENV, VERCEL: '1' },
        startDir,
      });
      expect.fail('expected assertDeploymentEnvValid to throw');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).not.toContain(Buffer.alloc(31, 0).toString('base64url'));
      expect(message).not.toContain('phc_test_project_key');
      // It must still name the failing rule so an operator can act — this is
      // `resolveProductAnalyticsConfig`'s own content-free message, reused
      // verbatim from the runtime boundary.
      expect(message).toContain('pseudonym keyring failed strict validation');
    }
  });

  it('does not throw for a fully valid deployment env when VERCEL=1', () => {
    expect(() =>
      assertDeploymentEnvValid({ processEnv: { ...VALID_POSTHOG_ENV, VERCEL: '1' }, startDir }),
    ).not.toThrow();
  });

  it('throws when a required non-PostHog key (OAK_API_KEY) is missing and VERCEL=1', () => {
    const withoutApiKey: Record<string, string | undefined> = { ...VALID_POSTHOG_ENV };
    withoutApiKey.OAK_API_KEY = undefined;
    try {
      assertDeploymentEnvValid({ processEnv: { ...withoutApiKey, VERCEL: '1' }, startDir });
      expect.fail('expected assertDeploymentEnvValid to throw');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).toContain('OAK_API_KEY');
    }
  });
});

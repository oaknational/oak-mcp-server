/**
 * Integration tests for the product-analytics composition root (MCP-241).
 *
 * One integration point (`composeProductAnalyticsRuntime`), two surfaces:
 * the composition contract proven with simple injected fakes, and the
 * real-SDK composition proof the fakes-based close-ownership test in
 * `handlers.integration.test.ts` explicitly defers ("the selected-mode
 * slice proves it against the real SDK transport"). The real adapter
 * runtime is driven through the package's injectable delivery transport,
 * so zero delivery is an executable assertion, never a prose claim; the
 * runtime is composed once for the file, honouring the adapter's
 * one-runtime-per-process contract.
 *
 * @see ADR-112 (per-request transport), ADR-218 §4 (observed connect target)
 */

import { describe, it, expect, vi, afterAll } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { wrapMcpServerWithSentry } from '@sentry/node';
import type { ProductAnalyticsRuntime } from '@oaknational/observability';
import {
  createPostHogProductAnalyticsRuntimeWithFetch,
  type PostHogFetch,
  type PostHogProductAnalyticsConfig,
  type PostHogWaitUntil,
} from '@oaknational/posthog-node';

import {
  composeProductAnalyticsRuntime,
  composeProductAnalyticsRuntimeOnce,
} from './compose-product-analytics-runtime.js';
import type { ProductAnalyticsBootstrap } from './product-analytics-config.js';
import { POSTHOG_EU_INGESTION_HOST } from './env-product-analytics.js';

const SELECTED_BOOTSTRAP: ProductAnalyticsBootstrap = {
  selected: true,
  projectApiKey: 'phc_test_key',
  host: POSTHOG_EU_INGESTION_HOST,
  activeKeyId: 'k2026_01',
  keyring: [{ id: 'k2026_01', key: new Uint8Array(32) }],
};

const PRODUCTION_RELEASE_INPUT = {
  VERCEL_ENV: 'production',
  VERCEL_GIT_COMMIT_REF: 'main',
  APP_VERSION: '1.110.0',
} as const;

function fakeRuntime(): ProductAnalyticsRuntime<Transport> {
  return {
    mode: 'posthog',
    sink: { capture: () => undefined },
    transportObserver: { observe: (transport) => transport },
    close: () => Promise.resolve({ ok: true, value: undefined }),
  };
}

const NOOP_WAIT_UNTIL: PostHogWaitUntil = () => undefined;
const NOOP_REPORT = () => undefined;

function composeSelected(
  overrides: Partial<Parameters<typeof composeProductAnalyticsRuntime>[0]> = {},
  factory: (config: PostHogProductAnalyticsConfig) => ProductAnalyticsRuntime<Transport> = () =>
    fakeRuntime(),
) {
  return composeProductAnalyticsRuntime(
    {
      bootstrap: SELECTED_BOOTSTRAP,
      serverVersion: '1.110.0',
      releaseInput: PRODUCTION_RELEASE_INPUT,
      toolNames: ['search', 'fetch'],
      resourceNames: ['oak-info'],
      waitUntil: NOOP_WAIT_UNTIL,
      reportOperationalError: NOOP_REPORT,
      ...overrides,
    },
    factory,
  );
}

describe('composeProductAnalyticsRuntime', () => {
  it('off mode: returns the inert runtime and never invokes the adapter factory', () => {
    const factory = vi.fn(fakeRuntime);
    const result = composeProductAnalyticsRuntime(
      {
        bootstrap: { selected: false },
        serverVersion: '1.110.0',
        releaseInput: PRODUCTION_RELEASE_INPUT,
        toolNames: [],
        resourceNames: [],
        waitUntil: NOOP_WAIT_UNTIL,
        reportOperationalError: NOOP_REPORT,
      },
      factory,
    );

    expect(factory).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.mode).toBe('off');
    const transport: Transport = {
      start: () => Promise.resolve(),
      send: () => Promise.resolve(),
      close: () => Promise.resolve(),
    };
    expect(result.value.transportObserver.observe(transport)).toBe(transport);
  });

  it('selected mode: assembles the adapter config with the atomically resolved release', () => {
    const received: PostHogProductAnalyticsConfig[] = [];
    const runtime = fakeRuntime();

    const result = composeSelected({}, (config) => {
      received.push(config);
      return runtime;
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value).toBe(runtime);
    expect(received).toHaveLength(1);
    const config = received[0];
    expect(config).toBeDefined();
    if (config === undefined) {
      return;
    }
    expect(config).toMatchObject({
      projectApiKey: 'phc_test_key',
      host: POSTHOG_EU_INGESTION_HOST,
      serverVersion: '1.110.0',
      release: { environment: 'production', value: '1.110.0' },
      toolNames: ['search', 'fetch'],
      resourceNames: ['oak-info'],
    });
    expect(config.waitUntil).toBe(NOOP_WAIT_UNTIL);
    expect(config.reportOperationalError).toBe(NOOP_REPORT);
  });

  it('selected mode: the projector is wired from the keyring and derives environment-scoped pseudonyms', () => {
    const received: PostHogProductAnalyticsConfig[] = [];

    const result = composeSelected({}, (config) => {
      received.push(config);
      return fakeRuntime();
    });

    expect(result.ok).toBe(true);
    const projected = received[0]?.activeActorProjector.project('user_test_1');
    expect(projected?.ok).toBe(true);
    if (!projected?.ok) {
      return;
    }
    expect(projected.value.keyId).toBe('k2026_01');
    expect(projected.value.environment).toBe('production');
    expect(projected.value.distinctId.length).toBeGreaterThan(0);
  });

  it('selected mode: a release failure is content-free, carries the closed kind, and never invokes the factory', () => {
    const factory = vi.fn(fakeRuntime);

    const result = composeSelected(
      // A production build on main with no application version is the
      // resolver's missing_application_version error path.
      { releaseInput: { VERCEL_ENV: 'production', VERCEL_GIT_COMMIT_REF: 'main' } },
      factory,
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    // The closed ReleaseError kind is the operator's actionable reason;
    // key material never appears.
    expect(result.error.message).toContain('missing_application_version');
    expect(result.error.message).not.toContain('phc_test_key');
    expect(factory).not.toHaveBeenCalled();
  });

  it('selected mode: a failing keyring is content-free and never invokes the factory', () => {
    const factory = vi.fn(fakeRuntime);

    const result = composeSelected(
      { bootstrap: { ...SELECTED_BOOTSTRAP, activeKeyId: 'k_missing' } },
      factory,
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.message).not.toContain('phc_test_key');
    expect(factory).not.toHaveBeenCalled();
  });
});

describe('composeProductAnalyticsRuntimeOnce (the deploy loader retry contract)', () => {
  it('a retried caller reuses the first composed runtime and never re-invokes the factory', () => {
    const factory = vi.fn(fakeRuntime);
    const memo = composeProductAnalyticsRuntimeOnce(() => composeSelected({}, factory));

    // The deploy entry handler clears ITS memo on a failed app load and
    // retries; the analytics memo sits outside that retry, so the second
    // call must return the SAME runtime with no second client.
    const first = memo();
    const second = memo();

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) {
      return;
    }
    expect(second.value).toBe(first.value);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('a failed composition is not cached, so a retry may compose again', () => {
    const attempts: boolean[] = [true];
    const memo = composeProductAnalyticsRuntimeOnce(() =>
      attempts.pop() === true
        ? composeSelected({
            // The resolver's missing_application_version failure path —
            // no client exists on this arm, so recomposing is safe.
            releaseInput: { VERCEL_ENV: 'production', VERCEL_GIT_COMMIT_REF: 'main' },
          })
        : composeSelected({}),
    );

    expect(memo().ok).toBe(false);
    expect(memo().ok).toBe(true);
  });
});

describe('the composed runtime with the real SDK (selected mode)', () => {
  const recordedDeliveries: { url: string }[] = [];
  const recordingFetch: PostHogFetch = (url) => {
    recordedDeliveries.push({ url });
    return Promise.resolve({
      status: 200,
      text: () => Promise.resolve('{}'),
      json: () => Promise.resolve({}),
    });
  };

  // Composed ONCE for the file (the adapter's one-runtime-per-process
  // contract); the final test closes it and afterAll's close is the
  // idempotent backstop.
  const composed = composeSelected({}, (config) =>
    createPostHogProductAnalyticsRuntimeWithFetch(config, recordingFetch),
  );
  const runtime = composed.ok ? composed.value : undefined;

  afterAll(async () => {
    await runtime?.close();
  });

  it('composes the real adapter runtime from the selected bootstrap', () => {
    expect(composed.ok).toBe(true);
  });

  async function connectComposedPair(): Promise<{
    transport: StreamableHTTPServerTransport;
    observed: Transport;
    server: McpServer;
  }> {
    if (runtime === undefined) {
      expect.fail('selected-mode composition failed');
    }
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    const observed = runtime.transportObserver.observe(transport);
    const server = new McpServer({ name: 'oak-curriculum-http', version: '0.1.0' });
    wrapMcpServerWithSentry(server);
    await server.connect(observed);
    return { transport, observed, server };
  }

  it('the Sentry-wrapped server connects through the real observed transport', async () => {
    const { transport, observed } = await connectComposedPair();

    // The adapter decorated the concrete transport (selected mode is never
    // identity) and decorates each concrete transport at most once.
    expect(observed).not.toBe(transport);
    expect(runtime?.transportObserver.observe(transport)).toBe(observed);
  });

  it('cleanup closes the concrete transport exactly once and never the connect target', async () => {
    const { transport, observed, server } = await connectComposedPair();
    const concreteClose = vi.spyOn(transport, 'close');
    const observedClose = vi.spyOn(observed, 'close');

    // The handler's exact cleanup pair (registerCleanupHandler). The
    // concrete transport's close fires `onclose` synchronously, the chain
    // propagates through the observed connect target, and the SDK server
    // clears its connection before its own close runs — so the connect
    // target's close is never invoked and the concrete transport is never
    // closed twice.
    const results = await Promise.allSettled([transport.close(), server.close()]);

    expect(results.map((result) => result.status)).toEqual(['fulfilled', 'fulfilled']);
    expect(concreteClose).toHaveBeenCalledTimes(1);
    expect(observedClose).not.toHaveBeenCalled();
  });

  it('the stateless composition never assigns the observed sessionId (MCP-331 fence)', async () => {
    const { transport, observed, server } = await connectComposedPair();

    // The adapter's sessionId setter forwards to the SDK transport, whose
    // own property is not assignable (MCP-331 owns the cure). This app's
    // stateless per-request composition (ADR-112) never assigns it.
    expect(observed.sessionId).toBeUndefined();

    await Promise.allSettled([transport.close(), server.close()]);

    expect(observed.sessionId).toBeUndefined();
  });

  it('composition and teardown perform zero deliveries', async () => {
    if (runtime === undefined) {
      expect.fail('selected-mode composition failed');
    }
    const closed = await runtime.close();

    expect(closed.ok).toBe(true);
    expect(recordedDeliveries).toEqual([]);
  });
});

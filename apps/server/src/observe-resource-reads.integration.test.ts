/**
 * Integration tests for the resource-read observation wrapper (MCP-242).
 *
 * Proves the DoD clauses at the wrapper boundary against a real `McpServer`:
 * the wrapper reads no resource result, forwards the same arguments and
 * return/error identity, records only canonical registration names, derives
 * identity only from validated auth context, and emits nothing when no
 * verified actor exists. The final test drives the REAL analytics runtime
 * through its injectable-fetch proof seam and pins the integer-duration
 * contract (`isValidDuration` rejects fractional values silently), so the
 * silent-drop class stays closed end to end.
 *
 * Production-surface behaviour (curriculum model, widget, list, unknown URI)
 * is proven through real SDK dispatch in
 * `handlers-resource-read-observation.integration.test.ts`.
 */

import { gunzipSync } from 'node:zlib';

import { assert, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type {
  ReadResourceCallback,
  ReadResourceTemplateCallback,
} from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { ProductAnalyticsSink } from '@oaknational/observability';
import { WIDGET_URI } from '@oaknational/curriculum-sdk/public/mcp-tools.js';
import {
  createPostHogPseudonymCapabilities,
  createPostHogProductAnalyticsRuntimeWithFetch,
  POSTHOG_EU_INGESTION_HOST,
  type PostHogFetch,
} from '@oaknational/posthog-node';

import { createObservedResourceRegistrar, resourceRegistrarFor } from './observe-resource-reads.js';
import { registerAllResources } from './register-resources.js';
import { SERVED_SURFACE } from './served-surface/served-surface.js';
import {
  createFakeAuthInfo,
  createFakeReadResourceExtra,
  createRecordingProductAnalyticsSink,
} from './test-helpers/fakes.js';

const PROBE_NAME = 'probe-resource';
const PROBE_URI = 'probe://fixed';

function createHarness() {
  const server = new McpServer({ name: 'test-server', version: '0.0.0' });
  const { sink, captures } = createRecordingProductAnalyticsSink();
  const registrar = createObservedResourceRegistrar(server, sink);
  return { server, registrar, captures };
}

function emptyResult(): ReadResourceResult {
  return { contents: [] };
}

describe('createObservedResourceRegistrar — registration boundary', () => {
  it('forwards the exact SDK registration handle for fixed and template registrations', () => {
    const server = new McpServer({ name: 'test-server', version: '0.0.0' });
    const spy = vi.spyOn(server, 'registerResource');
    const { sink } = createRecordingProductAnalyticsSink();
    const registrar = createObservedResourceRegistrar(server, sink);
    const read: ReadResourceCallback = emptyResult;
    const handle = registrar.registerResource(PROBE_NAME, PROBE_URI, {}, read);

    // Reference identity: the caller receives the handle the SDK returned.
    expect(handle).toBe(spy.mock.results[0]?.value);
    expect(handle.readCallback).not.toBe(read);
    // Discriminating member: pins the fixed branch to RegisteredResource —
    // the one correlation the overload implementation leaves compiler-open.
    expect(handle.name).toBe(PROBE_NAME);

    const templateRead: ReadResourceTemplateCallback = emptyResult;
    const template = new ResourceTemplate('probe://items/{id}', { list: undefined });
    const templateHandle = registrar.registerResource('probe-template', template, {}, templateRead);

    expect(templateHandle).toBe(spy.mock.results[1]?.value);
    expect(templateHandle.readCallback).not.toBe(templateRead);
    // Discriminating member: pins the template branch to RegisteredResourceTemplate.
    expect(templateHandle.resourceTemplate).toBe(template);
  });

  it('propagates a failed registration untouched and captures nothing', () => {
    const { registrar, captures } = createHarness();
    registrar.registerResource(PROBE_NAME, PROBE_URI, {}, emptyResult);

    expect(() => registrar.registerResource('probe-duplicate', PROBE_URI, {}, emptyResult)).toThrow(
      /already registered/,
    );
    expect(captures).toHaveLength(0);
  });

  it('adds no registration layer when no sink is supplied', () => {
    // Deliberate: a caller that omits the sink gets the exact server
    // reference, not a pass-through wrapper. (Production off mode is the
    // OTHER representation — it supplies an inert sink and still wraps.)
    const server = new McpServer({ name: 'test-server', version: '0.0.0' });

    expect(resourceRegistrarFor(server, undefined)).toBe(server);
  });

  it('leaves no read-time path that could emit for a public resource', () => {
    // Structural pin, deliberately: the module's guarantee is the ABSENCE of
    // an observation code path for public resources (no request-shape
    // variation can reach one), which behaviour sampling cannot prove.
    const { registrar } = createHarness();
    const read: ReadResourceCallback = emptyResult;

    const handle = registrar.registerResource('public-probe', WIDGET_URI, {}, read);

    expect(handle.readCallback).toBe(read);
  });

  it('registers every production resource with a fixed URI, never a template', () => {
    // The public-exclusion branch consults the allowlist for fixed URIs
    // only. This pins the fact that scoping rests on: a template
    // registration appearing here means the template branch needs its own
    // public-allowlist treatment before it lands.
    const server = new McpServer({ name: 'test-server', version: '0.0.0' });
    const spy = vi.spyOn(server, 'registerResource');
    registerAllResources(server, {
      getWidgetHtml: () => '<!doctype html><html><body>widget</body></html>',
      servedSurface: SERVED_SURFACE,
    });

    expect(spy.mock.calls.length).toBeGreaterThan(0);
    for (const call of spy.mock.calls) {
      expect(typeof call[1]).toBe('string');
    }
  });
});

describe('createObservedResourceRegistrar — authenticated reads', () => {
  it('captures one closed fact and forwards argument and result identity', async () => {
    const { registrar, captures } = createHarness();
    const result: ReadResourceResult = { contents: [{ uri: PROBE_URI, text: 'probe-text' }] };
    const received: unknown[] = [];
    const handle = registrar.registerResource(PROBE_NAME, PROBE_URI, {}, (uri, extra) => {
      received.push(uri, extra);
      return result;
    });

    const uri = new URL(PROBE_URI);
    const extra = createFakeReadResourceExtra(createFakeAuthInfo());
    const returned = await handle.readCallback(uri, extra);

    expect(returned).toBe(result);
    expect(received[0]).toBe(uri);
    expect(received[1]).toBe(extra);
    expect(captures).toHaveLength(1);
    const capture = captures[0];
    assert(capture !== undefined);
    expect(capture.event.kind).toBe('mcp_resource_read');
    expect(capture.event.resourceName).toBe(PROBE_NAME);
    expect(capture.event.isError).toBe(false);
    expect(capture.event.startedAt).toBeInstanceOf(Date);
    expect(Number.isSafeInteger(capture.event.durationMs)).toBe(true);
    expect(capture.event.durationMs).toBeGreaterThanOrEqual(0);
    expect(capture.context.verifiedActorId).toBe('user_123');
  });

  it('rethrows the exact callback error and records the error fact', async () => {
    const { registrar, captures } = createHarness();
    const failure = new Error('read exploded');
    const handle = registrar.registerResource(PROBE_NAME, PROBE_URI, {}, () => {
      throw failure;
    });

    await expect(
      handle.readCallback(new URL(PROBE_URI), createFakeReadResourceExtra(createFakeAuthInfo())),
    ).rejects.toBe(failure);

    expect(captures).toHaveLength(1);
    const capture = captures[0];
    assert(capture !== undefined);
    expect(capture.event.isError).toBe(true);
  });

  it('observes template reads under the registration name with variables forwarded', async () => {
    const { registrar, captures } = createHarness();
    const received: unknown[] = [];
    const template = new ResourceTemplate('probe://items/{id}', { list: undefined });
    const handle = registrar.registerResource(
      'probe-template',
      template,
      {},
      (uri, variables, extra) => {
        received.push(uri, variables, extra);
        return emptyResult();
      },
    );

    const uri = new URL('probe://items/1');
    const variables = { id: '1' };
    const extra = createFakeReadResourceExtra(createFakeAuthInfo());
    await handle.readCallback(uri, variables, extra);

    expect(received[0]).toBe(uri);
    expect(received[1]).toBe(variables);
    expect(received[2]).toBe(extra);
    expect(captures).toHaveLength(1);
    const capture = captures[0];
    assert(capture !== undefined);
    expect(capture.event.resourceName).toBe('probe-template');
  });

  it('never lets a throwing sink alter the read', async () => {
    const server = new McpServer({ name: 'test-server', version: '0.0.0' });
    const sink: ProductAnalyticsSink = {
      capture: () => {
        throw new Error('sink exploded');
      },
    };
    const registrar = createObservedResourceRegistrar(server, sink);
    const result = emptyResult();
    const handle = registrar.registerResource(PROBE_NAME, PROBE_URI, {}, () => result);

    const returned = await handle.readCallback(
      new URL(PROBE_URI),
      createFakeReadResourceExtra(createFakeAuthInfo()),
    );

    expect(returned).toBe(result);
  });
});

describe('createObservedResourceRegistrar — reads without a verified actor', () => {
  it.each([
    ['no auth context', undefined],
    ['auth context without a userId', createFakeAuthInfo({ extra: {} })],
    ['an empty-string userId', createFakeAuthInfo({ extra: { userId: '' } })],
  ])('emits nothing for a read with %s', async (_label, authInfo: AuthInfo | undefined) => {
    const { registrar, captures } = createHarness();
    const result = emptyResult();
    const handle = registrar.registerResource(PROBE_NAME, PROBE_URI, {}, () => result);

    const returned = await handle.readCallback(
      new URL(PROBE_URI),
      createFakeReadResourceExtra(authInfo),
    );

    expect(returned).toBe(result);
    expect(captures).toHaveLength(0);
  });

  it('rethrows the exact callback error and emits nothing without auth', async () => {
    const { registrar, captures } = createHarness();
    const failure = new Error('read exploded');
    const handle = registrar.registerResource(PROBE_NAME, PROBE_URI, {}, () => {
      throw failure;
    });

    await expect(
      handle.readCallback(new URL(PROBE_URI), createFakeReadResourceExtra()),
    ).rejects.toBe(failure);
    expect(captures).toHaveLength(0);
  });
});

const posthogBatchSchema = z
  .object({
    batch: z.array(
      z
        .object({
          event: z.string(),
          distinct_id: z.string(),
          properties: z.record(z.string(), z.unknown()),
        })
        .loose(),
    ),
  })
  .loose();

interface RecordedDelivery {
  readonly headers: Record<string, string>;
  readonly body: string | Blob | undefined;
}

/**
 * Decodes one recorded delivery by asserting the real client's contract
 * (the `posthog-final-wire` pattern): a gzip Blob whose decompressed JSON
 * matches the batch schema. Every step fails loud — no swallowed branch.
 */
async function parseBatch(delivery: RecordedDelivery) {
  expect(delivery.headers['Content-Encoding']).toBe('gzip');
  assert(delivery.body instanceof Blob, 'Expected the real client to send a gzip Blob');
  const decompressed = gunzipSync(Buffer.from(await delivery.body.arrayBuffer())).toString('utf8');
  const parsed: unknown = JSON.parse(decompressed);
  return posthogBatchSchema.parse(parsed).batch;
}

/**
 * Builds the REAL analytics runtime over its injectable-fetch proof seam,
 * recording deliveries. `collectDeliveredBatch` closes the runtime (which
 * flushes), settles the hosting flush work, and returns the single
 * delivered batch, failing loud on any deviation from the wire contract.
 */
function createRealAnalyticsRuntime() {
  const flushWork: Promise<unknown>[] = [];
  const deliveries: RecordedDelivery[] = [];
  const fetchFake: PostHogFetch = (_url, options) => {
    deliveries.push({ headers: options.headers, body: options.body });
    return Promise.resolve({
      status: 200,
      text: () => Promise.resolve('{}'),
      json: () => Promise.resolve({}),
    });
  };
  const capabilities = createPostHogPseudonymCapabilities({
    environment: 'production',
    activeKeyId: 'key-1',
    keyring: [{ id: 'key-1', key: new Uint8Array(32).fill(7) }],
  });
  assert(capabilities.ok);
  const runtime = createPostHogProductAnalyticsRuntimeWithFetch(
    {
      projectApiKey: 'phc_test',
      host: POSTHOG_EU_INGESTION_HOST,
      serverVersion: '0.0.0-test',
      release: {
        value: 'release-test',
        source: 'SENTRY_RELEASE_OVERRIDE',
        environment: 'production',
      },
      activeActorProjector: capabilities.value.active,
      toolNames: [],
      resourceNames: [PROBE_NAME],
      waitUntil: (promise) => {
        flushWork.push(promise);
      },
      reportOperationalError: () => undefined,
    },
    fetchFake,
  );

  async function collectDeliveredBatch() {
    const closed = await runtime.close();
    expect(closed.ok).toBe(true);
    // Promise.all, deliberately: a rejected background flush must fail the
    // test loudly (the posthog-final-wire harness precedent), never be
    // swallowed into a settled array nothing inspects.
    await Promise.all(flushWork);
    expect(deliveries).toHaveLength(1);
    const delivery = deliveries[0];
    assert(delivery !== undefined);
    return parseBatch(delivery);
  }

  return { runtime, collectDeliveredBatch };
}

describe('createObservedResourceRegistrar — real analytics path', () => {
  it('delivers an authenticated read through the real runtime with an integer duration and no content', async () => {
    const { runtime, collectDeliveredBatch } = createRealAnalyticsRuntime();
    const server = new McpServer({ name: 'test-server', version: '0.0.0' });
    const registrar = createObservedResourceRegistrar(server, runtime.sink);
    const handle = registrar.registerResource(PROBE_NAME, PROBE_URI, {}, emptyResult);

    await handle.readCallback(
      new URL(PROBE_URI),
      createFakeReadResourceExtra(createFakeAuthInfo()),
    );

    const batch = await collectDeliveredBatch();
    expect(batch).toHaveLength(1);
    const row = batch[0];
    assert(row !== undefined);
    expect(row.event).toBe('$mcp_resource_read');
    expect(row.distinct_id.startsWith('oakph:')).toBe(true);
    expect(row.properties['$mcp_resource_name']).toBe(PROBE_NAME);
    expect(Number.isSafeInteger(row.properties['$mcp_duration_ms'])).toBe(true);
    // Positive no-content-leak proof: the delivered property set is EXACTLY
    // the closed policy allowlist plus the client's own fixed library keys
    // (appended by posthog-node AFTER before_send) — nothing from the read
    // result, URI, or request can ride along.
    expect(
      Object.keys(row.properties).sort((left, right) => left.localeCompare(right)),
    ).toStrictEqual([
      '$geoip_disable',
      '$is_server',
      '$lib',
      '$lib_version',
      '$mcp_duration_ms',
      '$mcp_is_error',
      '$mcp_resource_name',
      '$mcp_server_name',
      '$mcp_server_version',
      '$mcp_source',
      'oak_environment',
      'oak_release',
    ]);
  });
});

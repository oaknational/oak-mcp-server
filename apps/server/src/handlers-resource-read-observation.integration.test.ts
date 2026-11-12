/**
 * Production-surface integration tests for resource-read observation
 * (MCP-242), driven through REAL SDK dispatch via the SDK `Client`.
 *
 * Registers the full handler surface via `registerHandlers` with a recording
 * sink and serves it over a linked `InMemoryTransport` pair, so `resources/*`
 * requests travel the same server dispatch production uses. `authInfo` rides
 * the transport's documented test seam — a bound `send` override, the same
 * pattern `posthog-final-wire.integration.test.ts` established — mirroring
 * how the HTTP transport populates it from `req.auth`.
 *
 * The authenticated proof pins `curriculum://model` deliberately: it is the
 * only live resource off the public allowlist today, so it is the exact
 * surface production reaches (pre-execution review finding I1). Public paths
 * are excluded STRUCTURALLY at registration, so a public read captures
 * nothing even with identity present. Wrapper mechanics (identity
 * forwarding, error paths, sink isolation) are proven in
 * `observe-resource-reads.integration.test.ts`.
 *
 * This file is the only suite exercising `registerHandlers` WITH a sink —
 * it guards the `resourceRegistrarFor` wiring line in `handlers.ts`.
 */

import { describe, expect, it } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import {
  CURRICULUM_MODEL_RESOURCE,
  WIDGET_URI,
} from '@oaknational/curriculum-sdk/public/mcp-tools.js';

import { registerHandlers } from './handlers.js';
import { requireMcpErrorCode } from './registration-proof/require-mcp-error-code.js';
import { createMockRuntimeConfig } from './test-helpers/auth-error-test-helpers.js';
import {
  createFakeAuthInfo,
  createFakeHttpObservability,
  createFakeLogger,
  createFakeSearchRetrieval,
  createRecordingProductAnalyticsSink,
  type RecordedAnalyticsCapture,
} from './test-helpers/fakes.js';

const TEST_WIDGET_HTML = '<!doctype html><html><body>Oak Curriculum App</body></html>';

interface ObservedServerHarness {
  readonly captures: readonly RecordedAnalyticsCapture[];
  readonly client: Client;
  readonly close: () => Promise<void>;
}

/**
 * Registers the full handler surface with a recording sink and connects a
 * real SDK `Client` over linked in-memory transports. When `authInfo` is
 * supplied, every client send carries it — the identity-present posture.
 */
async function startObservedServer(authInfo?: AuthInfo): Promise<ObservedServerHarness> {
  const server = new McpServer({ name: 'test-server', version: '0.0.0' });
  const { sink, captures } = createRecordingProductAnalyticsSink();
  registerHandlers(server, {
    runtimeConfig: createMockRuntimeConfig(),
    logger: createFakeLogger(),
    observability: createFakeHttpObservability(),
    searchRetrieval: createFakeSearchRetrieval(),
    resourceUrl: 'https://probe.test/mcp',
    getWidgetHtml: () => TEST_WIDGET_HTML,
    productAnalyticsSink: sink,
  });

  const client = new Client({ name: 'test-client', version: '0.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  if (authInfo !== undefined) {
    const send = clientTransport.send.bind(clientTransport);
    clientTransport.send = (message, options) => send(message, { ...options, authInfo });
  }
  await server.connect(serverTransport);
  await client.connect(clientTransport);

  return {
    captures,
    client,
    close: async () => {
      await Promise.all([client.close(), server.close()]);
    },
  };
}

describe('resource-read observation over real dispatch', () => {
  it('captures one fact for an authenticated curriculum-model read', async () => {
    const harness = await startObservedServer(createFakeAuthInfo());
    try {
      const result = await harness.client.readResource({ uri: CURRICULUM_MODEL_RESOURCE.uri });

      expect(result.contents[0]).toMatchObject({ uri: CURRICULUM_MODEL_RESOURCE.uri });
      expect(harness.captures).toHaveLength(1);
      const capture = harness.captures[0];
      expect(capture?.event.kind).toBe('mcp_resource_read');
      expect(capture?.event.resourceName).toBe(CURRICULUM_MODEL_RESOURCE.name);
      expect(capture?.event.isError).toBe(false);
      expect(capture?.context.verifiedActorId).toBe('user_123');
    } finally {
      await harness.close();
    }
  });

  it('serves the public widget read transparently and captures nothing', async () => {
    const harness = await startObservedServer();
    try {
      const result = await harness.client.readResource({ uri: WIDGET_URI });

      expect(result.contents[0]).toMatchObject({ uri: WIDGET_URI, text: TEST_WIDGET_HTML });
      expect(harness.captures).toHaveLength(0);
    } finally {
      await harness.close();
    }
  });

  it('captures nothing for a public resource read even with identity present', async () => {
    // Models the request shapes that reach a public resource WITH auth
    // applied (URI-normalisation differentials, JSON-RPC batches): the
    // public exclusion is structural at registration, not auth-conditioned.
    const harness = await startObservedServer(createFakeAuthInfo());
    try {
      const result = await harness.client.readResource({ uri: WIDGET_URI });

      expect(result.contents[0]).toMatchObject({ uri: WIDGET_URI, text: TEST_WIDGET_HTML });
      expect(harness.captures).toHaveLength(0);
    } finally {
      await harness.close();
    }
  });

  it('captures nothing for resources/list even with identity present', async () => {
    const harness = await startObservedServer(createFakeAuthInfo());
    try {
      const result = await harness.client.listResources();

      expect(result.resources.length).toBeGreaterThan(0);
      expect(harness.captures).toHaveLength(0);
    } finally {
      await harness.close();
    }
  });

  it('rejects an unknown resource before any callback and captures nothing', async () => {
    const harness = await startObservedServer(createFakeAuthInfo());
    try {
      const read = harness.client.readResource({ uri: 'probe://unknown' });

      await expect(read).rejects.toSatisfy((error: unknown) => {
        requireMcpErrorCode(error, ErrorCode.InvalidParams, 'resources/read');
        return true;
      });
      expect(harness.captures).toHaveLength(0);
    } finally {
      await harness.close();
    }
  });
});

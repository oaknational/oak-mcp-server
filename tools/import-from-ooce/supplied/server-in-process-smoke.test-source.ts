import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { createApp } from '../src/application.js';
import { getScratchStaticRoot } from '../src/test-helpers/static-root-fixture.js';
import { request } from '../src/test-helpers/loopback-request.js';
import { TEST_UPSTREAM_METADATA } from '../src/test-helpers/upstream-metadata-fixture.js';
import { createStubbedHttpApp, STUB_ACCEPT_HEADER } from './helpers/create-stubbed-http-app.js';
import { parseJsonRpcResult, parseSseEnvelope, readFirstTextContent } from './helpers/sse.js';
import {
  createMockObservability,
  createMockRuntimeConfig,
  createNoOpClerkMiddleware,
  createUnauthenticatedMcpAuthClerkDeps,
} from './helpers/test-config.js';

const InitializeResultSchema = z.object({
  protocolVersion: z.string(),
  serverInfo: z.object({ name: z.string() }),
});
const ToolListSchema = z.object({ tools: z.array(z.object({ name: z.string() })) });
const ProtectedResourceSchema = z.object({
  resource: z.string(),
  authorization_servers: z.array(z.string()).min(1),
});

async function postMcp(
  body: Record<string, unknown>,
): Promise<ReturnType<typeof parseSseEnvelope>> {
  const { app } = await createStubbedHttpApp();
  const res = await request(app).post('/mcp').set('Accept', STUB_ACCEPT_HEADER).send(body);
  expect(res.status).toBe(200);
  return parseSseEnvelope(res.text);
}

async function createAuthEnabledApp(): Promise<Awaited<ReturnType<typeof createApp>>> {
  const runtimeConfig = createMockRuntimeConfig({
    useStubTools: true,
    env: {
      OAK_API_KEY: 'stub-api-key',
      CLERK_PUBLISHABLE_KEY: 'pk_test_123',
      CLERK_SECRET_KEY: 'sk_test_123',
      ALLOWED_HOSTS: 'localhost,127.0.0.1,::1',
    },
  });
  return createApp({
    staticRoot: await getScratchStaticRoot(),
    runtimeConfig,
    observability: createMockObservability(runtimeConfig),
    getWidgetHtml: () => '<!doctype html><html><body>smoke-widget</body></html>',
    upstreamMetadata: TEST_UPSTREAM_METADATA,
    clerkMiddlewareFactory: createNoOpClerkMiddleware(),
    mcpAuthClerkDeps: createUnauthenticatedMcpAuthClerkDeps(),
  });
}

describe('server smoke (in process)', () => {
  it('answers initialize', async () => {
    const envelope = await postMcp({
      jsonrpc: '2.0',
      id: 'smoke-init',
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'smoke', version: '0.0.0' },
      },
    });
    const result = InitializeResultSchema.parse(envelope.result);
    expect(result.serverInfo.name.length).toBeGreaterThan(0);
  });

  it('lists the served tools', async () => {
    const envelope = await postMcp({ jsonrpc: '2.0', id: 'smoke-list', method: 'tools/list' });
    const names = ToolListSchema.parse(envelope.result).tools.map((tool) => tool.name);
    expect(names).toContain('search');
    expect(names).toContain('get-key-stages');
    expect(names).not.toContain('oak-under-the-hood');
  });

  it('calls a tool in stub mode', async () => {
    const envelope = await postMcp({
      jsonrpc: '2.0',
      id: 'smoke-call',
      method: 'tools/call',
      params: { name: 'get-key-stages', arguments: {} },
    });
    const result = parseJsonRpcResult(envelope);
    expect(result.isError).not.toBe(true);
    expect(readFirstTextContent(result.content ?? []).length).toBeGreaterThan(0);
  });

  it('challenges an unauthenticated MCP request and serves the protected-resource metadata', async () => {
    const app = await createAuthEnabledApp();
    const challenge = await request(app)
      .post('/mcp')
      .set('Host', 'localhost')
      .set('Accept', STUB_ACCEPT_HEADER)
      .send({ jsonrpc: '2.0', id: 'smoke-401', method: 'tools/list' });
    expect(challenge.status).toBe(401);
    expect(challenge.headers['www-authenticate']).toContain(
      '/.well-known/oauth-protected-resource/mcp',
    );

    const metadata = await request(app)
      .get('/.well-known/oauth-protected-resource/mcp')
      .set('Host', 'localhost');
    expect(metadata.status).toBe(200);
    const body = ProtectedResourceSchema.parse(metadata.body);
    expect(body.resource).toBe('http://localhost/mcp');
  });
});

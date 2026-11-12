/**
 * MCP server and transport test fakes.
 *
 * Returns narrow interfaces (`McpRequestServer`, `McpRequestTransport`) that
 * the product code depends on — no type assertions needed because the fakes
 * satisfy the interfaces structurally.
 *
 * @see ADR-078 Dependency Injection for Testability
 */

import { vi } from 'vitest';
import type {
  McpConnectTarget,
  McpRequestServer,
  McpRequestTransport,
  McpRequestContext,
  McpServerFactory,
} from '../mcp-request-context.js';

/**
 * Minimal transport fake for handler tests.
 * Satisfies `McpRequestTransport` structurally — only `handleRequest` and `close`.
 */
function createFakeStreamableTransport(
  handleRequestImpl?: McpRequestTransport['handleRequest'],
): McpRequestTransport {
  return {
    handleRequest: handleRequestImpl ?? vi.fn(),
    close: vi.fn(),
  };
}

/**
 * Minimal server fake for handler integration tests.
 * Satisfies `McpRequestServer` structurally — only `connect` and `close`.
 * Deliberately models NO SDK-internal teardown (callback wiring, close
 * cascades): the narrow contract owns only what the handler itself calls,
 * and SDK-side composition is proven against the real SDK, never a fake.
 */
function createFakeMcpServer(): McpRequestServer {
  return {
    connect: vi.fn(() => Promise.resolve()),
    close: vi.fn(() => Promise.resolve()),
  };
}

/**
 * Creates a factory that returns a pre-configured fake server + transport.
 *
 * Returns the factory and the underlying fakes so tests can inspect
 * what was called on them (e.g. transport.handleRequest args).
 */
export function createFakeMcpServerFactory(
  handleRequestImpl?: McpRequestTransport['handleRequest'],
  connectTransport?: McpConnectTarget,
): { factory: McpServerFactory; server: McpRequestServer; transport: McpRequestTransport } {
  const server = createFakeMcpServer();
  const transport = createFakeStreamableTransport(handleRequestImpl);
  // Mirrors off mode by default: the connect target IS the concrete transport.
  const context: McpRequestContext = {
    server,
    transport,
    connectTransport: connectTransport ?? transport,
  };
  const factory: McpServerFactory = () => context;
  return { factory, server, transport };
}

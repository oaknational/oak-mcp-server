/**
 * Per-request MCP server + transport contract.
 *
 * Defines the minimal interfaces consumed by `createMcpHandler` for the
 * per-request lifecycle: connect, handle, close. Product code depends on
 * these narrow interfaces (not the full SDK classes) so that test fakes
 * satisfy the types structurally without assertions (ADR-078).
 *
 * The real `McpServer` and `StreamableHTTPServerTransport` both satisfy
 * these interfaces structurally — the factory in `application.ts` creates
 * real SDK objects and returns them through this contract.
 *
 * @see ADR-112 Per-Request MCP Transport
 * @see ADR-078 Dependency Injection for Testability
 */

/**
 * Minimal transport contract for per-request lifecycle.
 *
 * Uses broad parameter types so that both the real SDK transport (which
 * expects `IncomingMessage` + `ServerResponse`) and test fakes (which pass
 * plain objects) satisfy the interface via contravariance.
 */
export interface McpRequestTransport {
  handleRequest(req: unknown, res: unknown, parsedBody?: unknown): Promise<void>;
  close(): Promise<void>;
}

/**
 * The transport handed to `server.connect` — the product-analytics
 * transport observer's return value. @see ADR-218 §4
 */
export interface McpConnectTarget {
  close(): Promise<void>;
}

/**
 * Minimal server contract for per-request lifecycle.
 * Covers `connect` and `close` — the only methods `createMcpHandler` calls.
 */
export interface McpRequestServer {
  connect(transport: McpConnectTarget): Promise<void>;
  close(): Promise<void>;
}

/** Per-request MCP server + transport pair. @see ADR-112 */
export interface McpRequestContext {
  readonly server: McpRequestServer;
  readonly transport: McpRequestTransport;
  /**
   * The product-analytics observer's return value (MCP-241). Off mode
   * observes nothing, so this is the exact `transport` reference. The
   * handler always calls `handleRequest` on the concrete `transport`,
   * and response cleanup closes only the concrete `transport` and the
   * server directly — it never invokes this connect target's `close()`.
   * SDK-side teardown is callback-driven: the concrete transport's
   * `close()` fires `onclose` synchronously, the chain propagates
   * through the connect target, and the SDK server clears its
   * connection before its own `close()` runs (verified against the
   * installed SDK). @see ADR-218 §4
   */
  readonly connectTransport: McpConnectTarget;
}

/** Factory creating a fresh McpServer + transport per request (stateless mode). */
export type McpServerFactory = () => McpRequestContext;

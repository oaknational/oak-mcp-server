import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ServedSurfaceDefinition } from './served-surface/served-surface.js';

/**
 * Server interface for resource registration — delegates to `McpServer`.
 *
 * Uses `Pick<McpServer, 'registerResource'>` so that `registerAppResource()`
 * (which needs the full `McpServer.registerResource` overloads) can accept the
 * same server reference.
 *
 * This is a genuine port, not just a convenience narrowing: the resource-read
 * observation decorator (`observe-resource-reads.ts`) is a second implementer,
 * so any implementation must mirror BOTH SDK `registerResource` overloads.
 */
export type ResourceRegistrar = Pick<McpServer, 'registerResource'>;

export interface ResourceRegistrationOptions {
  /** Returns the HTML payload served by the MCP App widget resource. */
  readonly getWidgetHtml: () => string;
  /**
   * The served-surface definition: every resource registration consults
   * its row here (live registers, dormant does not). The single point of
   * control per the mcp-101 ratified plan — no runtime flags.
   */
  readonly servedSurface: ServedSurfaceDefinition;
}

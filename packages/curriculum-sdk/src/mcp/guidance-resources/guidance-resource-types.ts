/**
 * Types for the agent guidance resource inventory.
 *
 * Guidance resources are agent-readable workflow documents (audience:
 * assistant) — the re-homed successors of the former user-invoked MCP
 * prompts. The inventory entry carries listing metadata only; document
 * content is served separately via `getAgentGuidanceContent` so listing
 * surfaces never pay the content weight.
 */

import type { McpResource } from '../mcp-resource-types.js';

/** One agent guidance document's inventory entry. */
export interface AgentGuidanceResource extends McpResource {
  /** ISO 8601 timestamp of the document's last substantive revision. */
  readonly lastModified: string;
  /**
   * Source-skill provenance for documents derived from the private
   * oak-skills estate — carries the keep-in-step obligation with the
   * named source skill. Absent on documents authored directly here.
   */
  readonly _meta?: {
    readonly provenance: string;
  };
}

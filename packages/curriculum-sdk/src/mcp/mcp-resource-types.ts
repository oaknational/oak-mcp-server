/**
 * Shared MCP resource type — the leaf module both the catalogue
 * (`all-resources.ts`) and the per-family inventories (e.g. the agent
 * guidance resources) import, so inventories can join the catalogue
 * without a dependency cycle.
 */

/**
 * The common shape every MCP resource definition shares. Concrete resources may
 * carry extra fields (for example `_meta.attribution` on the graph and model
 * resources); this interface captures only the fields listing surfaces read.
 */
export interface McpResource {
  /** Unique resource identifier used at registration. */
  readonly name: string;
  /** Resource URI (e.g. `docs://oak/getting-started.md`, `eef://interpretation`). */
  readonly uri: string;
  /** Human-readable title shown in listings. */
  readonly title: string;
  /** Description shown in resource listings. */
  readonly description: string;
  /** MIME type — `text/markdown` for docs/EEF, `application/json` for the graphs/model. */
  readonly mimeType: string;
  /** MCP resource annotations for priority and audience targeting. */
  readonly annotations: {
    readonly priority: number;
    readonly audience: ('user' | 'assistant')[];
  };
}

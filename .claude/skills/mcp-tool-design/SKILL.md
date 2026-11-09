---
name: mcp-tool-design
description: >-
  Rules for designing and reviewing this server's MCP tools, resources and
  prompts. Use when adding or changing a tool definition, its input schema,
  its annotations or its description, or when reviewing one. For protocol
  questions beyond these rules, use the `mcp-expert` agent and the live
  specification.
---

# MCP tool design

This server implements MCP revision `2025-11-25`, which ADR 229 in `docs/adr/mcp/` pins. Check a rule here against the live `2025-11-25` specification at `https://modelcontextprotocol.io/specification/2025-11-25` before you rely on it. Where this file and that revision disagree, the spec wins. Say so in the PR. Report a requirement that only a newer revision adds as a migration gap, not a defect.

Tool schemas are generated from the OpenAPI snapshot. Fix a missing description or annotation in the generator or its override layer, never in the output. See `update-upstream-api-schema`.

## Rules

- **Name.** Use kebab-case. One verb-led name per tool, stable across releases.
- **Input schema.** Keep it flat. Nested `params`, `query` or `path` objects break client parameter discovery. Give every parameter a `.describe()` text and mark required fields correctly. Never fall back to `z.any()`.
- **Description.** Say what the tool does, when to use it, and what it returns. State side effects and anything the caller cannot see. A description that omits a side effect is a defect.
- **Annotations.** Set `readOnlyHint`, `destructiveHint`, `idempotentHint` and `openWorldHint` on every tool, and make them true. Annotations are hints for clients, not security controls.
- **Results.** Return a standard `CallToolResult` with a `content` array. Report failure with `isError: true` and a message the model can act on. Do not throw for expected failures.
- **Auth.** Every HTTP method needs a valid bearer token, including `initialize` and `tools/list`. A `noauth` marker on a tool means no scope check, not no authentication.
- **Transport.** Stateless HTTP builds one server and transport per request. Keep no session state between requests.
- **Primitives.** Tools are model-controlled and resources are application-controlled. Prompts are user-controlled. Pick the primitive by who decides to invoke it.
- **Apps.** For widgets, use `registerAppTool` and `registerAppResource`, the exported MIME constant, and `getUiCapability` with a text-only fallback. Widget data flows through the MCP bridge, never `window.openai`. Await `connect()` before rendering.

## Review checklist

- [ ] Name, description and every parameter read clearly to a model with no other context.
- [ ] Annotations are present and true.
- [ ] The schema is flat, with no `z.any()`.
- [ ] Side effects are in the description.
- [ ] Failure returns `isError: true`, not a throw.
- [ ] `pnpm surface:diff` (arrives in P13) shows only the intended change.

## Related

- `mcp-expert` agent for spec review and capability routing.
- ADRs under `docs/adr/mcp/` for the decisions behind these rules.

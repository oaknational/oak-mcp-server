# 0001. Use a standalone oak-mcp-server repository

- **Status:** Accepted (2026-10-28)
- **Date:** 2026-10-28
- **Source:** Oak's engineering ADR record ADR-231, as accepted.

## Context

Oak's MCP server lives in the `oak-open-curriculum-ecosystem` monorepo (OOCE), beside Oak's other curriculum tooling. A review of the repository topology found separate applications that different squads would own, each with its own lifecycle and release cadence. The review concluded that separately owned repositories remove that coupling.

## Decision

Oak's canonical external MCP server moves out of OOCE into its own repository, `oak-mcp-server`.

## Consequences

- The squad that owns the MCP server controls its own release cadence and review.
- The name is short and easy to remember for Oak's canonical external MCP server.
- A more cautious name, `oak-curriculum-mcp-server`, was raised and not taken. Revisit it if the server's remit stays curriculum-only in practice.

## Compliance

New MCP server work lands in `oak-mcp-server`. No further MCP server code is added to OOCE.

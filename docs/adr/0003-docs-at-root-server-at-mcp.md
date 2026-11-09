# 0003. Serve docs at the root and the server at /mcp

- **Status:** Accepted (2026-11-09). Replaces the 2026-08-20 ruling that made `mcp.thenational.academy` serve only the MCP server.
- **Date:** 2026-11-09

## Context

On 2026-08-20 OOCE ruled that `mcp.thenational.academy` would be the MCP server alone. Anything that served HTML for the product would come from Oak's web application instead. The server removed its HTML pages, and tests now guard that the server answers a browser with no HTML.

Developers who connect an AI client to the server need documentation at a stable address next to the endpoint. A single host for both keeps the endpoint address unchanged for existing clients.

## Decision

Static documentation owns `/` on `mcp.thenational.academy`. The server owns these paths:

- `/mcp` and `/mcp/*`
- `/oauth/*`
- `/.well-known/oauth-protected-resource`
- `/.well-known/oauth-protected-resource/mcp`
- `/.well-known/oauth-authorization-server`
- `/healthz`

The server process still renders no HTML. The documentation is built as static files and served by the host's routing, never by the server.

This record replaces the 2026-08-20 ruling. The rule that the server serves no HTML stays in force.

## Consequences

- The MCP endpoint address stays the same for every existing client.
- The routing layer splits traffic by path. A path the server owns must never fall through to the documentation.
- The documentation site is part of this repository and follows its accessibility and review rules.

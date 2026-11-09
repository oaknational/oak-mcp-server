# MCP architecture decision records from OOCE

These 26 records come from the Oak open curriculum ecosystem (OOCE) repository at `d5846cf6f37270c73291640a526124429369ee97`. They are the OOCE decisions still in force for this server. Each file keeps its OOCE number and carries its OOCE path in a header. This repository numbers its own decisions separately, in [the ADR index](../README.md).

## Index

- [ADR 035. Unified SDK-MCP Code Generation](035-unified-sdk-mcp-code-generation.md)
- [ADR 037. Minimal Tool Lookup Architecture](037-embedded-tool-information.md)
- [ADR 050. MCP Tool Generation Layering: Directional Acyclic Graph](050-mcp-tool-layering-dag.md)
- [ADR 052. OAuth 2.1 for MCP HTTP Server Authentication](052-oauth-2.1-for-mcp-http-authentication.md)
- [ADR 053. Clerk as Identity Provider and Authorization Server](053-clerk-as-identity-provider.md)
- [ADR 054. Tool-Level Authentication Error Interception and \_meta Emission](054-tool-level-auth-error-interception.md)
- [ADR 056. Conditional Clerk Middleware for MCP Discovery Methods](056-conditional-clerk-middleware-for-discovery.md)
- [ADR 057. Selective Authentication for Public MCP Resources](057-selective-auth-public-resources.md)
- [ADR 061. Widget Call-to-Action System](061-widget-cta-system.md)
- [ADR 071. Widget URI Cache-Busting Simplification](071-widget-uri-cache-busting-simplification.md)
- [ADR 107. Deterministic SDK / NL-in-MCP Boundary](107-deterministic-sdk-nl-in-mcp-boundary.md)
- [ADR 112. Per-Request MCP Transport for Stateless Mode](112-per-request-mcp-transport.md)
- [ADR 113. MCP Spec-Compliant Auth for All Methods](113-mcp-spec-compliant-auth-for-all-methods.md)
- [ADR 115. Proxy OAuth Authorisation Server for Cursor Compatibility](115-proxy-oauth-as-for-cursor.md)
- [ADR 122. Permissive CORS for OAuth-Protected MCP Servers](122-permissive-cors-for-oauth-protected-mcp.md)
- [ADR 123. MCP Server Primitives Strategy](123-mcp-server-primitives-strategy.md)
- [ADR 141. MCP Apps Standard as Only UI Surface](141-mcp-apps-standard-primary.md)
- [ADR 142. `@clerk/mcp-tools` Adopt-or-Explain Decision](142-clerk-mcp-tools-adopt-or-explain.md)
- [ADR 151. MCP App Styling Independence from Oak Web Application and Oak Components](151-mcp-app-styling-independence.md)
- [ADR 156. Embed Widget HTML as Committed TypeScript Constant](156-embed-widget-html-at-build-time.md)
- [ADR 179. Transport-Agnostic Graph Substrate: Surfacing Is A Consumer-Side Concern](179-transport-agnostic-graph-substrate.md)
- [ADR 195. Graph Tools Are a First-Class Tool Category](195-graph-tools-first-class-tool-category.md)
- [ADR 196. Graph Substrate Migration: One Replacement Unit per Tool](196-graph-substrate-migration-one-unit-per-tool.md)
- [ADR 217. Server-Rendered HTML in the MCP App](217-server-rendered-html-in-the-mcp-app.md) (superseded by ADR 0003)
- [ADR 218. PostHog MCP Analytics Identity, Session, and Privacy Boundary](218-posthog-mcp-analytics-identity-session-and-privacy.md)
- [ADR 229. The MCP app stays a legacy-era `2025-11-25` server until the SDK v2 package family is adopted](229-mcp-protocol-revision-legacy-era-until-sdk-v2.md)

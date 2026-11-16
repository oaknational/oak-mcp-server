# 0004. Complete the list of paths the server owns

- **Status:** Accepted (2026-11-16). Amends [0003](0003-docs-at-root-server-at-mcp.md).
- **Date:** 2026-11-16

## Context

[ADR 0003](0003-docs-at-root-server-at-mcp.md) lists the paths the server owns, so that edge routing can send the rest to the documentation site. Checked against the route registrations in `apps/server/src` at the pinned OOCE import SHA (`PROVENANCE.md`), that list missed paths the server already serves: `/.well-known/openai-apps-challenge`, `/robots.txt`, `/assets/download/:lesson/:type`, the cron trigger at `/api/cron/refresh-graph`, and the root static asset tree. Routing built from ADR 0003's list alone would send each of these to the documentation site instead of the server, breaking OpenAI's domain verification, lesson asset downloads, the graph refresh cron, and the design system and brand assets the pages reference.

## Decision

The server owns every path below. This list replaces the one in ADR 0003's "Decision" section.

- `/mcp` and `/mcp/*` (`auth-routes.ts`).
- `/oauth/register`, `/oauth/authorize` and `/oauth/token`, matched by `/oauth/*` (`oauth-proxy/oauth-proxy-routes.ts`).
- `/.well-known/oauth-protected-resource` and `/.well-known/oauth-protected-resource/mcp` (`auth-routes.ts`).
- `/.well-known/oauth-authorization-server` (`auth-routes.ts`).
- `/.well-known/openai-apps-challenge` (`openai-domain-verification.ts`). OpenAI fetches this to verify the host for the Apps SDK listing.
- `/robots.txt` (`robots-txt.ts`).
- `/assets/download/:lesson/:type` (`asset-download/asset-download-route.ts`). Signed lesson asset downloads.
- `/api/cron/refresh-graph` (`cron/refresh-graph.ts`). Vercel's cron trigger for the curriculum graph refresh, registered whenever `CRON_SECRET` is set, which it is in every deployed environment.
- `/healthz`, and the routed `/mcp/healthz` (`app/health-paths.ts`). The routed form already falls under `/mcp/*` above; it is named here because it is a probe target in its own right.
- The root static asset tree (`app/static-content.ts`, `app/static-asset-paths.ts`): every path under `/favicons/`, `/carousel/`, `/oak-ds/` and `/oak-assets/`, such as `/oak-ds/styles.css`. Each is mounted at both the root and under `/mcp/`.

Two further routes exist in the source but are not part of the server's production surface, so routing rules built from this list should not reserve them:

- `POST /test-error` (`test-error/test-error-route.ts`) registers only when `TEST_ERROR_SECRET` is set, and the env schema refuses to start the server with that variable set in `production` (`env.ts`).
- `GET /.well-known/mcp-stub-mode` (`auth-routes.ts`) registers only when the opt-in `OAK_CURRICULUM_MCP_USE_STUB_TOOLS` flag is on, which no deployed environment sets.

## Consequences

- Routing rules that split traffic between this server and the documentation site are built from this list, not from ADR 0003's.
- A path the server adds later needs the same check against the route registrations before a routing rule is built or changed on the strength of this list, or it silently falls through to the documentation site.

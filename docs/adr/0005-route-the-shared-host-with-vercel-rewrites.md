# 0005. Route the shared host with rewrites from the docs project

- **Status:** Proposed (2026-11-17). It becomes Accepted when the staging measurements in "What is not yet verified" pass. If they fail, the fallback below applies and this record is amended.
- **Date:** 2026-11-17

## Context

[ADR 0003](0003-docs-at-root-server-at-mcp.md) puts the static docs at `/` and the server at `/mcp` on one host. [ADR 0004](0004-complete-the-list-of-server-owned-paths.md) lists every path the server owns. Something has to split traffic by path. The plan names two candidate mechanisms:

1. Cloudflare origin rules that match on path only. The plan calls this the precedent on `www`, where `/mcp` reaches the server today (MCP-617). MCP-617 records that nobody has confirmed whether that routing is an origin rule, a Snippet or a Worker.
2. A rewrite in the docs project that forwards the server's paths to the server project.

The plan picks between them by three measurements on a staging host: every probe passes, a streaming call over 60 seconds is not buffered, and added p95 latency stays under 50 ms. The staging host does not exist yet. `dig +short mcp-staging.thenational.academy` returned nothing on 2026-11-17, because the DNS record (MCP-812) waits on MCP-787 naming who applies it. The GitHub deployments API lists no deployments for this repository either. So this record chooses on the evidence below and names the measurements that confirm or reverse the choice.

## Evidence

### The docs site cannot use a Next.js rewrite

`apps/docs/next.config.ts` sets `output: 'export'`. Next.js lists rewrites, redirects, headers and proxy as unsupported in a static export ([Next.js, Static Exports, "Unsupported Features"](https://nextjs.org/docs/app/guides/static-exports)). The second mechanism therefore has to be a Vercel rewrite in `apps/docs/vercel.json`. Vercel says rewrites to external origins "work universally with all frameworks" ([Vercel, Rewrites](https://vercel.com/docs/routing/rewrites)).

### Production today

Read-only probes of `https://mcp.thenational.academy` on 2026-11-17 returned `server: cloudflare`, a `cf-ray` and an `x-vercel-id` on every path. The host resolves to Cloudflare addresses. `GET /` answers the current server's 404 with its `x-app-version`, so the whole host goes to the server, not a docs site. `POST /mcp` answered 401 with `cache-control: no-store` and a `WWW-Authenticate` that names `https://mcp.thenational.academy/.well-known/oauth-protected-resource/mcp`.

The server already expects to sit behind a proxy that presents its own Vercel hostname as `Host`. It names its public origin from `CANONICAL_HOST` (`apps/server/src/canonical-origin.ts`) and writes that host into `x-forwarded-host` for Clerk (`apps/server/src/canonical-forwarded-headers.ts`). Both mechanisms deliver requests in that shape, so neither needs a server change.

### Mechanism 1: Cloudflare origin rules

- **Routing.** One rule in the zone's `http_request_origin` phase with the `route` action, overriding the Host header and the resolved hostname to the server project's domain ([Cloudflare, Define a single origin rule using Terraform](https://developers.cloudflare.com/rules/origin-rules/examples/define-single-origin-terraform/)). The expression matches `/mcp` exactly, `starts_with` for `/mcp/`, `/oauth/`, `/assets/download/` and each static asset tree, and exact matches for the other ADR 0004 paths. Everything else falls through to the docs project as the host's default origin. The rule runs before any origin, so a docs file can never shadow a server path.
- **Plan.** Host header and DNS record overrides are Enterprise only ([Cloudflare, Origin Rules](https://developers.cloudflare.com/rules/origin-rules/)). Production behaves as if the `www` routing overrides the Host header. Nobody has confirmed which Cloudflare feature does it, so this record does not know whether the zone has these overrides.
- **Terraform.** "Terraform assumes that it has complete control over account and zone rulesets." Existing rules must be imported with `cf-terraforming` or removed first ([Cloudflare, WAF custom rules with Terraform](https://developers.cloudflare.com/terraform/additional-configurations/waf-custom-rules/)). If the `www` routing is an origin rule, moving the staging rule into `infra/edge/` means this repository takes over the zone's whole `http_request_origin` ruleset, `www` rules included, or the apply deletes them.
- **Streaming.** The proxy read timeout is 125 seconds, returning 524, and only Enterprise zones can change it ([Cloudflare, Connection limits](https://developers.cloudflare.com/fundamentals/reference/connection-limits/)). The page does not say whether the timeout applies between chunks of a streamed response. Production already streams through Cloudflare today.
- **Rollback.** Revert the rule in Terraform, or disable it in the dashboard. Either needs the Cloudflare role MCP-787 names.

### Mechanism 2: Vercel rewrites from the docs project

- **Routing.** `rewrites` in `apps/docs/vercel.json` forward each ADR 0004 path to the server project's domain. Vercel passes `x-forwarded-host` with the host the visitor requested, plus `x-forwarded-proto`, `x-forwarded-for` and `x-real-ip` ([Vercel, Rewrites](https://vercel.com/docs/routing/rewrites)). The server ignores the forwarded host and uses `CANONICAL_HOST`, as it does today.
- **Shadowing.** "Precedence is given to the filesystem prior to rewrites being applied" ([Vercel, vercel.json](https://vercel.com/docs/project-configuration/vercel-json)). A docs file at a server path would win silently. A local `next build` of `apps/docs` on 2026-11-17 wrote no file or directory under `out/` at any ADR 0004 path, so nothing collides today. The routing work adds a check that keeps it so.
- **Reserved path.** `/.well-known/acme-challenge` cannot be rewritten ([Vercel, Rewrites](https://vercel.com/docs/routing/rewrites)). No server path uses it. The rewrites name each `/.well-known/` path the server owns rather than the whole prefix.
- **Streaming.** An external target that does not respond within 120 seconds returns `ROUTER_EXTERNAL_TARGET_ERROR` as a 502 ([Vercel, error reference](https://vercel.com/docs/errors/ROUTER_EXTERNAL_TARGET_ERROR)). Vercel's changelog says the wait covers the start of the response, and that a backend can run longer "as long as it continues sending data at least once every 120 seconds" ([Vercel changelog](https://vercel.com/changelog/cdn-origin-timeout-increased-to-two-minutes)). That is the same order as Cloudflare's 125 seconds.
- **Caching.** For projects created on or after 2026-04-06, Vercel caches external rewrite responses by their upstream `cache-control` ([Vercel, Rewrites](https://vercel.com/docs/routing/rewrites)). The docs project will be new. `/mcp` already sends `no-store`. The routing work probes cache headers on every server path, and sets `x-vercel-enable-rewrite-caching: 0` on them if any comes back cached.
- **Extra hop.** Every MCP request crosses the docs project's edge and then the server project's. The docs deployment joins the request path of `/mcp`, so a broken docs deploy can break the protocol.
- **Rollback.** Vercel instant rollback of the docs project, or a revert PR. The team holds both, and each docs preview deployment carries its rewrites, so a change can be probed before it merges.

### Concerns both mechanisms share

- **OAuth and metadata.** `/oauth/*` and the protected-resource and authorization-server metadata paths are forwarded unchanged. The metadata and the `WWW-Authenticate` pointer come from `CANONICAL_HOST`, not from the arriving host, so the staging server needs `CANONICAL_HOST` set to the staging host.
- **Cron.** Vercel triggers a cron with a GET to "your project's production deployment URL", for example `https://*.vercel.app/api/cron` ([Vercel, Cron Jobs](https://vercel.com/docs/cron-jobs)). The graph refresh never passes through the shared host, so neither mechanism affects it. `/api/cron/refresh-graph` is still routed to the server so that a manual call reaches it.
- **CSP and headers.** The docs CSP is a `<meta>` tag that `apps/docs/scripts/csp.mts` writes into each HTML page at build time, so it travels with docs pages only. Server responses keep the server's own security headers. Any `headers` rule in `apps/docs/vercel.json` uses a source that excludes server paths.
- **Reverse proxy.** Vercel does not recommend a reverse proxy in front of a project, because its firewall loses visibility ([Vercel, Reverse Proxy Servers](https://vercel.com/docs/security/reverse-proxy)), and Bot Protection's managed ruleset "does not work" behind one ([Vercel, Using Cloudflare and other reverse proxies with Vercel](https://vercel.com/kb/guide/can-i-use-a-proxy-on-top-of-my-vercel-deployment)). Production already runs Cloudflare in front of Vercel. Mechanism 1 keeps that shape. Mechanism 2 always puts the docs project's edge in front of the server project. Vercel runs firewall checks on each hop of an external rewrite ([changelog](https://vercel.com/changelog/fast-data-transfer-for-rewrites-between-a-teams-projects-is-now-free)), but its docs do not say whether the server project sees the visitor's IP or the docs edge's. The server leaves volumetric control to the edge (ADR-219).
- **`/.well-known/openid-configuration`.** A comment on MCP-817 asks for this path to be routed. The server registers no route for it. It appears only in `CLERK_SKIP_PATHS` (`apps/server/src/clerk-skip-surfaces.ts`), so routing it would send requests to a 404 on the server instead of one on docs. ADR 0004's list stands.

## Decision

Route the shared host with Vercel rewrites in `apps/docs/vercel.json`. The staging DNS record points at the docs project, and the docs project forwards every ADR 0004 path to the server project. Path matching only, never `Accept`.

The reasons, in order of weight:

1. **It needs nobody outside the team after the DNS record.** Mechanism 1 needs a Cloudflare role that can write rules, and a decision on who owns the zone's origin ruleset, which may hold `www`'s rules too. Neither is in place. It also needs the Enterprise Host and DNS overrides, and nobody has confirmed the zone has them.
2. **The routing lives in this repository.** Mechanism 2 closes the plan's "edge configuration is not in version control" risk without taking over another team's rules.
3. **Every change can be proven before merge.** A docs preview deployment carries its rewrites. Mechanism 1 can be proven only on the staging host, by the person who applies it.
4. **The team can roll it back.** Instant rollback or a revert, with no Cloudflare access.

Mechanism 1 stays the fallback. Switch to it, and amend this record, if mechanism 2 fails any of the plan's three measurements: a probe fails, a stream over 60 seconds is buffered or cut, or routed p95 is more than 50 ms above direct.

## Consequences

- The routing work adds `apps/docs/vercel.json`, which is outside the file list the plan gives the staging-host phase. The plan's `infra/edge/` holds only the staging DNS record.
- The docs project serves production traffic once production cuts over, so its production builds must be turned on then. Today its `ignore_command` skips them (`infrastructure/project/locals.tf`).
- A check in CI fails if the docs build writes any file at an ADR 0004 path.
- A server path added later needs a rewrite, under ADR 0004's existing consequence.
- The staging and production server deployments set `CANONICAL_HOST` to the shared host.

## What is not yet verified

None of these can run before the staging DNS record (MCP-812) exists and both Vercel projects deploy. Each one confirms the decision or triggers the fallback.

- Every ADR 0004 path and the MCP-617 probes, run through a docs deployment's rewrites, including `/mcpfoo` and `/mcp-not-a-path` reaching docs.
- A streamed tool call over 60 seconds, checking that events arrive one by one and the call completes. That includes whether Vercel's 120-second limit applies between chunks of a rewritten response, which the error page does not say.
- Routed p95 latency of `POST /mcp` `tools/list` against the server's direct URL.
- Whether the docs project's `trailingSlash: true` makes Vercel redirect `/mcp` to `/mcp/` before the rewrite runs. The `vercel.json` reference does not say how `trailingSlash` and rewrites interact. A redirect there would break every MCP client.
- Whether Vercel passes the server's 3xx responses from `/oauth/authorize` through to the client unchanged.
- Whether Vercel Deployment Protection on server previews blocks a rewrite from a docs preview, and so whether the rewrite needs Vercel's bypass header.
- Whether the shared host is proxied through Cloudflare or DNS-only, which decides whether Cloudflare's 125-second read timeout also applies.
- Cache headers on every server path through the rewrite, and that none comes back cached (`x-vercel-cache`), since Vercel caches external rewrites by upstream `cache-control` for new projects.
- Whether the server project's firewall, rate limits and Bot Protection see the visitor's IP or the docs project's edge on a rewritten request.
- That the staging protected-resource metadata `resource`, and the `resource_metadata` in the 401 `WWW-Authenticate`, name the staging host, not the server's Vercel host.
- For the fallback only: the zone's Cloudflare plan, and whether `www`'s origin rules are one rule or several and in what order.

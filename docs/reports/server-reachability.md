# Server reachability

This report measures how much of `apps/server/src` the production server reaches. It is step 1 of [MCP-867](https://linear.app/oaknational/issue/MCP-867). The cuts it proposes land after cutover, so the moved copy stays faithful until then.

Measured at `7174bb3` with:

```sh
pnpm reachability --json reachability.json
```

The script is [tools/reachability/reachability.ts](../../tools/reachability/reachability.ts). Its configuration for this server is [apps-server.json](../../tools/reachability/apps-server.json). Rerun it before and after each cut, and put both bucket tables in the PR body.

## How the script decides

The script loads `apps/server/tsconfig.json` into the TypeScript compiler and follows symbols, not just imports.

- **Roots.** Production starts at `src/server.ts` (the Vercel export) and `src/index.ts` (the Node listener). Every top-level statement in a root is live.
- **Walk.** For each live declaration, the checker resolves every identifier it uses, through re-exports, to the declaring top-level statement. A use in a value position makes the target live. A use in a type position (`: T`, `typeof x`, `satisfies T`) makes it type-live only.
- **Dev gates.** A declaration listed under `devGates` runs only when a development or preview switch is on. The walk crosses it in dev mode. The two gates are `registerTestErrorRoute`, which needs `TEST_ERROR_SECRET` (refused in production by `src/env.ts`), and `createStubRequestExecutor`, which needs `OAK_CURRICULUM_MCP_USE_STUB_TOOLS`.
- **Dev roots.** `scripts/`, `build-scripts/`, `operations/`, `conformance/src/`, `esbuild.config.ts` and `tools/surface-diff` are walked in dev mode after production.
- **Scope.** Every `.ts` file in `apps/server/src`, except `*.test.ts`, `src/test-helpers/` and `src/test.setup.ts`.

Each file lands in one bucket, checked in this order:

| Bucket            | Meaning                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------- |
| called            | Production reaches at least one of its value declarations.                                  |
| dev-only-ships    | Only a dev gate or dev root reaches it, but production loads it, so it ships in the bundle. |
| dev-only-tooling  | Only a dev root reaches it. Production never loads it.                                      |
| type-only         | Production code uses only its types.                                                        |
| loaded-not-called | Production imports it at runtime but uses none of its declarations.                         |
| unreachable       | Nothing outside tests reaches it.                                                           |

Physical lines match `wc -l`. Code lines leave out blank and comment-only lines.

**Limits.** "Called" means a live declaration refers to it, not that a request executed it. A branch behind a runtime flag inside a called function counts as called, unless that flag's target is a configured dev gate. The `/.well-known/mcp-stub-mode` route in `src/auth-routes.ts` is one such branch. The script does not measure layers that only forward a call. Packages under `packages/` are out of scope, and [MCP-866](https://linear.app/oaknational/issue/MCP-866) covers them.

## Totals

| Bucket            | Files | Physical lines | Code lines |
| ----------------- | ----: | -------------: | ---------: |
| called            |   106 |          12956 |       7969 |
| type-only         |     6 |            285 |         95 |
| loaded-not-called |     0 |              0 |          0 |
| dev-only-ships    |     1 |            230 |        171 |
| dev-only-tooling  |     6 |            934 |        480 |
| unreachable       |     8 |            633 |        506 |
| total             |   127 |          15038 |       9221 |

All ten request entry points the script checks are in the called bucket: `initialize` and `tools/list` (`app/core-endpoints.ts`), `POST /mcp` and `GET /mcp` (`auth-routes.ts`), `tools/call` (`tool-handler-with-auth.ts`), tool registration (`handlers.ts`), resources (`register-resources.ts`), the OAuth proxy (`oauth-proxy/oauth-proxy-routes.ts`), the MCP token check (`auth/mcp-auth/mcp-auth.ts`), `/healthz` (`app/health-endpoints.ts`), the cron route (`cron/refresh-graph.ts`) and the static asset routes (`app/static-content.ts`). The script exits 1 if any of them leaves that bucket.

Inside reachable files, the script also finds:

- 26 declarations nothing reaches: 192 physical lines, 111 code lines.
- 2 declarations in called files that only a dev path reaches: 50 physical lines, 21 code lines.

The finding: almost all of `src` is reachable. Dead, dev-only and unreachable files add up to 1797 physical lines (230 + 934 + 633), about 12% of 15038. The large savings sit in the reachable transport and auth wiring that MCP SDK v2 could replace.

## Not called in production

### Unreachable

| File                                                                | Physical | Code | Test files importing it |
| ------------------------------------------------------------------- | -------: | ---: | ----------------------: |
| registration-proof/current-source-registration-proof.ts             |      182 |  172 |                       0 |
| registration-proof/current-source-guidance-registration-evidence.ts |      106 |  101 |                       1 |
| registration-proof/guidance-list-parity.ts                          |       85 |   82 |                       1 |
| registration-proof/guidance-read-parity.ts                          |       60 |   56 |                       1 |
| html-encoding.ts                                                    |      115 |   43 |                       1 |
| build-identity.ts                                                   |       47 |   34 |                       1 |
| registration-proof/require-mcp-error-code.ts                        |       13 |   12 |                       2 |
| auth-log-context.ts                                                 |       25 |    6 |                       2 |

`auth-log-context.ts` is imported by `src/test-helpers/auth-error-test-helpers.ts`, so cutting it means moving it into `test-helpers/`, not deleting it.

### Dev-only, shipped to production

| File or declaration                                      | Physical | Code | Gate                                |
| -------------------------------------------------------- | -------: | ---: | ----------------------------------- |
| test-error/test-error-route.ts                           |      230 |  171 | `TEST_ERROR_SECRET`                 |
| tool-executor-factory.ts:144 `createStubRequestExecutor` |       30 |   18 | `OAK_CURRICULUM_MCP_USE_STUB_TOOLS` |

`test-error/register-diagnostic-routes.ts` is called, because it runs in production to check the secret. With it, the `test-error/` directory is 276 physical lines and 193 code lines. `scripts/probe-sentry-error-capture.sh` uses the route to check Sentry capture on preview deployments, so removing it is the operator's call.

### Dev-only tooling inside `src`

| File                                    | Physical | Code |
| --------------------------------------- | -------: | ---: |
| mcp-registry/server-json-constraints.ts |      176 |  109 |
| mcp-registry/registry-validation.ts     |      187 |  100 |
| registration-proof/served-tool-table.ts |      110 |   91 |
| mcp-registry/server-json-inputs.ts      |      223 |   80 |
| registration-proof/connected-client.ts  |       71 |   56 |
| mcp-registry/server-json.ts             |      167 |   44 |

`served-origin.ts:123 resolveServedPrmUrl` (20 physical, 3 code) is also reached only from tooling. `mcp-registry/server-json-types.ts` (76 physical, 29 code) is type-only and belongs with these files.

### Largest dead declarations in reachable files

| Declaration                                                                    | Physical | Code |
| ------------------------------------------------------------------------------ | -------: | ---: |
| security.ts:66 `dnsRebindingProtection`                                        |       63 |   33 |
| runtime-config-from-validated-env.ts:155 `createRuntimeConfigFromValidatedEnv` |       21 |   12 |
| observability/http-observability.ts:234 `createHttpObservabilityOrThrow`       |       12 |   10 |
| type-helpers.ts:30 `typeSafeValues`                                            |       10 |    7 |
| served-surface/served-surface.ts:145 `isAppLocalToolLive`                      |        7 |    6 |

The other 21 are 9 lines or fewer each. Run the script for the full list.

## Proposed cut PRs

Each PR reruns `pnpm reachability` and states the before and after tables. The golden `tools/list`, the resources and the conformance results must not change.

| Order | PR                                                                                                                                              | Physical lines out of `src` |         Code lines |
| ----: | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------: | -----------------: |
|     1 | Delete the unreachable files and their tests. Move `auth-log-context.ts` into `test-helpers/`.                                                  |                         633 |                506 |
|     2 | Delete the 26 dead declarations.                                                                                                                |                         192 |                111 |
|     3 | Move the six tooling files, `server-json-types.ts` and `resolveServedPrmUrl` to `scripts/` or `tools/`. These lines move, they are not deleted. |        1030 (934 + 76 + 20) | 512 (480 + 29 + 3) |
|     4 | Remove the stub executor and the stub-mode route, together with the stub adapter that MCP-866 removes from `curriculum-sdk`.                    |            30 and the route |   18 and the route |
|     5 | Decide the `/test-error` route. If preview probing moves elsewhere, delete `test-error/` and the `TEST_ERROR_SECRET` handling.                  |                         276 |                193 |

PRs 1 to 3 need no decision. PR 4 depends on MCP-866. PR 5 needs the operator.

## What MCP SDK v2 could replace

[MCP-506](https://linear.app/oaknational/issue/MCP-506) sizes the move from `@modelcontextprotocol/sdk` 1.x to the v2 packages. The script's `groups` setting measures the two areas that spike names. Every file in both groups is called or type-only, so only a replacement can shrink them.

| Group                                       | Files | Physical lines | Code lines |
| ------------------------------------------- | ----: | -------------: | ---------: |
| MCP transport and request routing           |     9 |           1038 |        518 |
| Auth: Clerk, OAuth proxy, PRM, token checks |    30 |           3813 |       2383 |

Together that is 4851 physical lines, about 37% of the 12956 called lines. These are candidates, not verified replacements. MCP-506 must first confirm what the v2 `server` and `node` packages ship for transport, bearer auth and protected resource metadata. It also names guard contracts that must be ported, not dropped: key-realm validation, the `DANGEROUSLY_DISABLE_AUTH` refusal, `authorizedParties` threading and `CANONICAL_HOST` anchoring. `security.ts` and `host-header-validation.ts` hold the Host allowlist, so a port keeps that check too.

- **Transport and routing:** `mcp-handler.ts`, `mcp-router.ts`, `mcp-middleware.ts`, `mcp-request-context.ts`, `mcp-public-browser-leg.ts`, `host-header-validation.ts`, `host-validation-error.ts`, `security.ts`, `auth/mcp-body-parser.ts`.
- **Auth:** `auth/mcp-auth/`, `oauth-proxy/`, `auth/public-resources.ts`, `check-mcp-client-auth.ts`, `conditional-clerk-middleware.ts`, `clerk-skip-surfaces.ts`, `global-auth-context.ts`, `tool-auth-checker.ts`, `tool-handler-with-auth.ts`, the four `auth-*` files, `auth-routes.ts`, and `app/oauth-and-caching-setup.ts`, `app/upstream-metadata-fetch.ts` and `app/clerk-key-pairing.ts`.

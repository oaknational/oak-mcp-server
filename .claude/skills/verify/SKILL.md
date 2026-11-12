---
name: verify
description: Start Oak's MCP server (apps/server) locally on port 3333 and prove a change on the real surface — /healthz, the graph refresh cron route, MCP tool calls through the inspector CLI, the widget, and the served-surface diff. Use after changing the server, a tool, a resource, the widget or the graph pipeline, before saying a change works.
---

# Verify the MCP server

Tests alone do not verify a change. Drive the running server, save the evidence, then clean up. Read [features/README.md](features/README.md) for the per-feature recipes.

## Launch

Run from the repository root after `pnpm install --frozen-lockfile` and `pnpm build`.

Set `RUN` to a fresh scratch directory, for example `RUN=$(mktemp -d)/verify`, and `mkdir -p "$RUN/graph" "$RUN/evidence"`.

Auth stays on by default. Boot needs a real Clerk development instance, because start-up fetches `/.well-known/oauth-authorization-server` from the Clerk frontend API and stops on any error. Ask the operator for the keys, or for approval to add `DANGEROUSLY_DISABLE_AUTH=true`. Never add that flag on your own.

```bash
export CRON_SECRET=local-cron-secret-0123456789
OAK_CURRICULUM_MCP_USE_STUB_TOOLS=true \
OAK_API_KEY=stub-api-key \
ELASTICSEARCH_URL=https://stub.invalid \
ELASTICSEARCH_API_KEY=stub-key \
CLERK_PUBLISHABLE_KEY=<from operator> CLERK_SECRET_KEY=<from operator> \
SENTRY_MODE=off \
CRON_SECRET="$CRON_SECRET" \
GRAPH_CORPUS_LOCAL_PATH="$RUN/graph" \
pnpm --filter @oaknational/mcp-server dev > "$RUN/server.log" 2>&1 &
echo $! > "$RUN/server.pid"
```

The dev command builds the widget first, so the first boot takes about 30 seconds. The server is ready when `curl -sf localhost:3333/healthz` returns 200. Poll it every 2 seconds for up to 2 minutes. If it never answers, read the last lines of `$RUN/server.log`. `Application startup failed` names the cause.

Only one instance fits on port 3333. If the port is already answering and this run did not start it, stop and ask. Never drive or kill someone else's server.

## Doctor

```bash
curl -si localhost:3333/healthz
```

Expect 200 and a JSON body with `status: "ok"`, `mode: "streamable-http"` and `graph: { generatedAt, stale }`. The process in `$RUN/server.pid` must be alive. A `graph.generatedAt` of `null` means no snapshot is stored under `GRAPH_CORPUS_LOCAL_PATH`. `pnpm graph:refresh --store local --bulk-dir <dir>` writes one.

## Drive

- HTTP routes: use `curl -si`. Recipes are in [features/health-and-graph.md](features/health-and-graph.md).
- MCP calls: use `npx @modelcontextprotocol/inspector --cli http://localhost:3333/mcp --transport http --method <method>`. With auth on, add `--header "Authorization: Bearer <token>"`. Recipes are in [features/mcp-tools.md](features/mcp-tools.md).
- Widget: see [features/widget.md](features/widget.md).
- Served surface: `pnpm surface:diff` from the repository root compares the served tools, resources and prompts with OOCE's. The only expected difference is the removed under-the-hood tool. The script lands with the surface-diff PR, so check that `package.json` has it first.

## Evidence

Save every capture to `$RUN/evidence/<slug>.txt` or `<slug>.png`. Include the exact command and the full response, with status line and headers for HTTP. For a change with side effects, also capture the side effect, such as the files under `$RUN/graph/graph-corpus/v1/` after a refresh. Drive the real routes. Never call internal functions or test seams to prove behavior.

## Cleanup

```bash
kill "$(cat "$RUN/server.pid")"
```

Kill only the PID this run started. Leave `$RUN/evidence` in place and report its path. The operator removes it.

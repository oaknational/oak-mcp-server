# MCP tools

## Sub-features

- `tools/list` returns the served tools. [served-tool-table.md](../../../../apps/server/served-tool-table.md) is the generated reference.
- `tools/call` runs a tool. With `OAK_CURRICULUM_MCP_USE_STUB_TOOLS=true` the tools return stub data and make no upstream calls.
- `resources/read` returns resources, including the widget.

## How to get to it (user POV)

A teacher's AI client connects to `/mcp` over streamable HTTP, after OAuth through Clerk.

## Driving it with the inspector CLI

```bash
INSPECT="npx @modelcontextprotocol/inspector --cli http://localhost:3333/mcp --transport http"
$INSPECT --method tools/list --header "Authorization: Bearer $TOKEN"
$INSPECT --method tools/call --tool-name get-key-stages --header "Authorization: Bearer $TOKEN"
$INSPECT --method resources/read --uri ui://widget/oak-curriculum-app-v1.html --header "Authorization: Bearer $TOKEN"
```

Drop `--header` only when the operator approved the `dev:observe:noauth` launch.

Pass: `tools/list` lists the tools in the served tool table. Each call returns a result with no `isError`.

## Gotchas

- Without a token and with auth on, `/mcp` returns 401 with a `WWW-Authenticate` header that points at the protected resource metadata. That is the auth check working, not a failure.
- `--tool-arg` values are strings. Pass numbers and arrays the way the tool's input schema accepts them.

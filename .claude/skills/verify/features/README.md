# Verification map

Each file covers one surface of the MCP server. Start the server with the skill's Launch section first. Run the Doctor check before any recipe.

| Feature                                 | Covers                                                       |
| --------------------------------------- | ------------------------------------------------------------ |
| [Health and graph](health-and-graph.md) | `/healthz`, `/mcp/healthz`, `/api/cron/refresh-graph`        |
| [MCP tools](mcp-tools.md)               | `tools/list`, `tools/call`, `resources/read`, auth on `/mcp` |
| [Widget](widget.md)                     | The `ui://widget/oak-curriculum-app-v1.html` MCP App         |

## Proof rules

- Capture the request and the response, not only a summary.
- Report a recipe you could not run with the command you tried and the precondition that was missing. Never weaken a recipe to make it pass.

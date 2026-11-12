# Widget

## Sub-features

- The MCP App resource `ui://widget/oak-curriculum-app-v1.html`, which hosts render for tool results.

## How to get to it (user POV)

A host that supports MCP Apps calls `get-curriculum-model`, the served tool whose `_meta.ui.resourceUri` names the widget, and renders the widget beside the result.

## Driving it

- Resource check: read the resource with the inspector CLI, as in [mcp-tools.md](mcp-tools.md). Pass when the body is HTML and its `_meta.ui.csp` lists the font domains.
- Rendered check: `pnpm --filter @oaknational/mcp-server test:widget:ui` runs the Playwright widget suite. Save its report as evidence.
- In a host: `pnpm --filter @oaknational/mcp-server dev:widget-in-host` clones the unpinned `@modelcontextprotocol/ext-apps` repository and runs it with `bun`. Ask the operator before running it. Then open `http://localhost:8080`, call `get-curriculum-model` and capture a screenshot and the browser console. Pass when the widget renders with no console errors.

## Gotchas

- The served widget HTML is the generated constant in `apps/server/src/generated/widget-html-content.ts`. The dev command rebuilds the widget with Vite but does not regenerate that constant. After a widget edit, run `pnpm --filter @oaknational/mcp-server build:widget`, then restart the server.

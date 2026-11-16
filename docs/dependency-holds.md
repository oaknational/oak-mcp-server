# Dependency holds

Each deliberate version hold gets one bullet. Start the bullet with the package name in backticks, then the word `below` and the first version the hold keeps out, also in backticks. Then give the reason and the condition for removing the hold.

The `lockfile-rebuild` check reads this list. It deletes the lockfile, rebuilds it, and fails when a held package resolves to its bound or later. A newer version below the bound passes. Declare the hold in `package.json` or in the `overrides` key of `pnpm-workspace.yaml`, never only in the lockfile. Every package in `overrides` must also resolve to the same version after the rebuild.

## Holds

- `typescript` below `6.1`: held by the `~6.0.3` range in `package.json` and the Dependabot ignore of `>=6.1`. typescript-eslint 8.72.1 supports TypeScript below 6.1 only, so 6.1 and later break lint. Lift when a typescript-eslint release supports the newer range, then raise the range in `package.json` and drop the ignore.
- `@types/node` below `25`: held at major 24 (Dependabot ignores `>=25`). The runtime is Node 24, so newer types allow APIs that do not exist at runtime. Lift when the runtime and `engines.node` move to Node 25 or later.
- `markdownlint-cli2` below `0.24`: held by the `^0.23` range in `package.json` and the Dependabot ignore of 0.24.0. Version 0.24.0 pulls in markdownlint 0.42.0 and re2js 2.8.6, which carries advisory GHSA-gg6h-894w-4m9c (high severity), and dependency review blocks it. Lift when a markdownlint-cli2 release depends on markdownlint 0.42.1 or later.
- `@mcpjam/cli` below `6.1.0`: held by the exact `3.19.0` pin in `package.json` (an exact pin can't resolve past itself on a rebuild) and the Dependabot ignore of `>=6.1.0`. 6.1.0 newly pulls in re2js 2.8.6 (GHSA-gg6h-894w-4m9c, high severity), not present in the lockfile at all below it. Lift when a @mcpjam/cli release no longer pulls in a vulnerable re2js.
- `@modelcontextprotocol/ext-apps` below `2.0.0`: held by the exact `1.7.5` pin in `apps/server/package.json` and the Dependabot ignore of `>=2.0.0`. 2.0.0 targets the split v2 MCP TypeScript SDK (`@modelcontextprotocol/core`/`client`/`server`), dropping `@modelcontextprotocol/sdk` as a peer; this repo and its curriculum-sdk/posthog-node/codegen packages are still on the monolithic v1 SDK, and v1/v2 server objects must not be mixed. Lift once the v1→v2 migration (MCP-886) lands.

# Dependency holds

Each deliberate version hold gets one bullet. Start the bullet with the package name in backticks, then give the reason and the condition for removing the hold.

The `lockfile-rebuild` check reads this list. It fails when a held package resolves to a different version after the lockfile is deleted and rebuilt. Declare the hold in `package.json` or in the `overrides` key of `pnpm-workspace.yaml`, never only in the lockfile.

## Holds

- `typescript`: held below 6.1 (Dependabot ignores `>=6.1`). typescript-eslint 8.72.1 supports TypeScript below 6.1 only, so 6.1 and later break lint. Lift when a typescript-eslint release supports the newer range, then raise the range in `package.json`.
- `@types/node`: held at major 24 (Dependabot ignores `>=25`). The runtime is Node 24, so newer types allow APIs that do not exist at runtime. Lift when the runtime and `engines.node` move to Node 25 or later.
- `markdownlint-cli2`: held below 0.24.0 (Dependabot ignores that version). It pulls in markdownlint 0.42.0 and re2js 2.8.6, which carries advisory GHSA-gg6h-894w-4m9c (high severity), and dependency review blocks it. Lift when a markdownlint-cli2 release depends on markdownlint 0.42.1 or later.

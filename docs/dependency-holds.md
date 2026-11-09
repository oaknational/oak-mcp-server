# Dependency holds

Each deliberate version hold gets one bullet. Start the bullet with the package name in backticks, then give the reason and the condition for removing the hold.

The `lockfile-rebuild` check reads this list. It fails when a held package resolves to a different version after the lockfile is deleted and rebuilt. Declare the hold in `package.json` or in the `overrides` key of `pnpm-workspace.yaml`, never only in the lockfile.

## Holds

No holds yet.

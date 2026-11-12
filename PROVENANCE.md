# Provenance

This repository's code is imported from the `oak-open-curriculum-ecosystem` repository (OOCE) by the import tool, never by hand.

Pinned OOCE import SHA: `d5846cf6f37270c73291640a526124429369ee97`

## What an entry records

Each entry covers one package directory in this repository. It records:

- the OOCE source directories and the pinned SHA they were read at;
- how many files were copied unchanged;
- each file the tool modified, such as `package.json` or a file with a manifest edit;
- each file supplied from this repository instead of OOCE;
- each OOCE file the tool dropped, with the reason.

`tools/import-from-ooce/imported.json` holds the SHA-256 hash of each file copied unchanged. Modified and supplied files have no hash there.

Only the import tool writes entries. Nobody edits the entries by hand. A pull request that changes an entry without running the tool fails review.

## Package directories belong to the tool

The tool owns each package directory named in `tools/import-from-ooce/manifest.json`. A re-import deletes every file in that directory that the import does not write, tracked or not. Only `node_modules`, `dist`, `coverage` and `.turbo` are left alone. To change an imported package, change the manifest and re-import. The tool refuses to write or delete through a symlink.

## Entries

### `packages/result`

- Source: `packages/core/result` at `d5846cf6f37270c73291640a526124429369ee97`.
- Copied unchanged: 6 files.
- Modified by the tool: `package.json`, `src/unwrapping.ts`, `tsconfig.json`, `tsup.config.ts`, `vitest.config.ts`.
- Dropped `packages/core/result/eslint.config.ts`. The root eslint.config.ts lints packages/**.

### `packages/observability`

- Source: `packages/core/observability` at `d5846cf6f37270c73291640a526124429369ee97`.
- Copied unchanged: 14 files.
- Modified by the tool: `package.json`, `README.md`, `src/json-sanitisation.ts`, `src/primitives.ts`, `src/redaction.ts`, `src/redaction.unit.test.ts`, `src/sink-registry.ts`, `tsconfig.json`, `tsup.config.ts`, `vitest.config.ts`.
- Supplied from this repository: `src/type-safe.ts`.
- Dropped `packages/core/observability/eslint.config.ts`. The root eslint.config.ts lints packages/**.

### `packages/env`

- Source: `packages/core/env`, `packages/libs/env-resolution` at `d5846cf6f37270c73291640a526124429369ee97`.
- Copied unchanged: 15 files.
- Modified by the tool: `package.json`, `README.md`, `src/index.ts`, `src/resolution/README.md`, `src/resolution/resolve-env.ts`, `src/resolution/types.ts`, `src/root-package-version.ts`, `src/schemas/index.ts`, `src/schemas/observability-axes.ts`, `src/schemas/observability-base.ts`, `src/schemas/observability-refinements.ts`, `src/schemas/observability.ts`, `src/schemas/observability.unit.test.ts`, `tests/resolution/app-root.integration.test.ts`, `tests/resolution/repo-root.integration.test.ts`, `tests/resolution/resolve-env.integration.test.ts`, `tests/resolution/warnings-channel.unit.test.ts`, `tests/root-package-version.unit.test.ts`, `tests/schemas/sentry.unit.test.ts`, `tsconfig.json`, `tsup.config.ts`, `vitest.config.ts`.
- Dropped `packages/core/env/eslint.config.ts`. The root eslint.config.ts lints packages/**.
- Dropped `packages/libs/env-resolution/eslint.config.ts`. The root eslint.config.ts lints packages/**.
- Dropped `packages/libs/env-resolution/package.json`. Dependencies merged into the env package.json.
- Dropped `packages/libs/env-resolution/tsconfig.build.json`. The env package's own file covers the merged tree.
- Dropped `packages/libs/env-resolution/tsconfig.json`. The env package's own file covers the merged tree.
- Dropped `packages/libs/env-resolution/tsconfig.lint.json`. The env package's own file covers the merged tree.
- Dropped `packages/libs/env-resolution/tsup.config.ts`. The env package's own file covers the merged tree.
- Dropped `packages/libs/env-resolution/vitest.config.ts`. The env package's own file covers the merged tree.

### `packages/build-metadata`

- Source: `packages/core/build-metadata` at `d5846cf6f37270c73291640a526124429369ee97`.
- Copied unchanged: 20 files.
- Modified by the tool: `package.json`, `tsconfig.json`, `tsup.config.ts`, `vitest.config.ts`.
- Dropped `packages/core/build-metadata/eslint.config.ts`. The root eslint.config.ts lints packages/**.

### `packages/logger`

- Source: `packages/libs/logger` at `d5846cf6f37270c73291640a526124429369ee97`.
- Copied unchanged: 30 files.
- Modified by the tool: `package.json`, `README.md`, `src/error-normalisation-fields.ts`, `src/error-normalisation.unit.test.ts`, `src/file-sink.ts`, `src/file-sink.unit.test.ts`, `src/node.ts`, `tsconfig.json`, `tsup.config.ts`, `vitest.config.ts`.
- Modified `src/file-sink.ts`. A write stream error, such as a log path that is a directory or cannot be written, is reported through console.error instead of crashing the process. OOCE has the same bug. MCP-853.
- Modified `src/file-sink.unit.test.ts`. The stream fake gains the on method that the stream interface now requires. MCP-853.
- Modified `src/node.ts`. The Node stream adapter passes the stream's error event to the file sink. MCP-853.
- Supplied from this repository: `src/file-sink-stream-errors.unit.test.ts`, `src/type-safe.ts`.
- Dropped `packages/libs/logger/eslint.config.ts`. The root eslint.config.ts lints packages/**.

### `packages/sentry-node`

- Source: `packages/libs/sentry-node` at `d5846cf6f37270c73291640a526124429369ee97`.
- Copied unchanged: 17 files.
- Modified by the tool: `package.json`, `README.md`, `src/config.integration.test.ts`, `src/runtime-redaction-barrier.unit.test.ts`, `src/runtime-redaction.ts`, `src/runtime-scope.integration.test.ts`, `src/runtime-sdk.ts`, `src/runtime-sdk.unit.test.ts`, `src/runtime-sinks.ts`, `src/runtime.integration.test.ts`, `tsconfig.json`, `tsup.config.ts`, `vitest.config.ts`.
- Supplied from this repository: `src/type-safe.ts`.
- Dropped `packages/libs/sentry-node/.sentryclirc`. It names a real Sentry organisation and host.
- Dropped `packages/libs/sentry-node/eslint.config.ts`. The root eslint.config.ts lints packages/**.

### `packages/posthog-node`

- Source: `packages/libs/posthog-node` at `d5846cf6f37270c73291640a526124429369ee97`.
- Copied unchanged: 33 files.
- Modified by the tool: `package.json`, `src/client-product-selection.ts`, `src/event-policy.integration.test.ts`, `src/mcp-transport-observer-collaborator.integration.test.ts`, `src/product-analytics-sink.integration.test.ts`, `tsconfig.json`, `tsup.config.ts`, `vitest.config.ts`.
- Dropped `packages/libs/posthog-node/eslint.config.ts`. The root eslint.config.ts lints packages/**.

### `packages/openapi-zod-client-adapter`

- Source: `packages/core/openapi-zod-client-adapter` at `d5846cf6f37270c73291640a526124429369ee97`.
- Copied unchanged: 9 files.
- Modified by the tool: `package.json`, `README.md`, `src/endpoint-types.ts`, `tsconfig.json`, `tsup.config.ts`, `vitest.config.ts`.
- Modified `src/endpoint-types.ts`. The example path matches the pre-commit personal-data scrub pattern for home directories, so it is renamed. No test reads it.
- Dropped `packages/core/openapi-zod-client-adapter/eslint.config.ts`. The root eslint.config.ts lints packages/**.

### `packages/graph-core`

- Source: `packages/core/graph-core` at `d5846cf6f37270c73291640a526124429369ee97`.
- Copied unchanged: 37 files.
- Modified by the tool: `package.json`, `src/vocab/index.unit.test.ts`, `src/vocab/registry.ts`, `tsconfig.json`, `tsup.config.ts`, `vitest.config.ts`.
- Supplied from this repository: `src/type-safe.ts`.
- Dropped `packages/core/graph-core/eslint.config.ts`. The root eslint.config.ts lints packages/**.

### `packages/codegen`

- Source: `packages/sdks/oak-sdk-codegen` at `d5846cf6f37270c73291640a526124429369ee97`.
- Copied unchanged: 480 files.
- Modified by the tool: `code-generation/test-fixtures.ts`, `code-generation/typegen/bulk/generate-bulk-schemas.ts`, `package.json`, `README.md`, `reference/README.md`, `src/synonym-export.ts`, `src/synonyms/README.md`, `src/types/helpers/type-helpers.ts`, `tsconfig.json`, `tsconfig.lint.json`, `tsup.config.ts`.
- Modified `code-generation/test-fixtures.ts`. The example path matches the pre-commit personal-data scrub pattern for home directories, so it is renamed. No test reads it.
- Modified `reference/README.md`. The link points at this repository's root .gitignore, which carries the same reference rule, one level nearer than in OOCE.
- Modified `src/synonyms/README.md`. The search app stays in OOCE, so the link points at its file at the pinned SHA.
- Modified `tsconfig.lint.json`. The type-check covers the generated vocab modules too, as the repository's type-check coverage test requires. They type-check clean.
- Kept OOCE's relative paths in `code-generation/typegen/search/generate-search-index-docs.ts`. The ../../../../docs/ paths are output paths into the package's own generated docs folder, not links into OOCE.
- Kept OOCE's relative paths in `code-generation/typegen/search/generate-search-modules.unit.test.ts`. The ../../../../docs/ paths are output paths into the package's own generated docs folder, not links into OOCE.
- Kept OOCE's relative paths in `code-generation/typegen/search/generate-search-response-docs.ts`. The ../../../../docs/ paths are output paths into the package's own generated docs folder, not links into OOCE.
- Supplied from this repository: `prettier.config.mjs`, `src/types/helpers/type-safe.ts`, `tests/drift.test.ts`, `vocab-gen/scripts/graph-refresh.integration.test.ts`, `vocab-gen/scripts/graph-refresh.ts`, `vocab-gen/scripts/run-graph-refresh.ts`.
- Dropped `packages/sdks/oak-sdk-codegen/e2e-tests/scripts/codegen-core.e2e.test.ts`. Its config is dropped. The codegen e2e lane is deferred to MCP-861.
- Dropped `packages/sdks/oak-sdk-codegen/eslint.config.ts`. The root eslint.config.ts lints packages/**.
- Dropped `packages/sdks/oak-sdk-codegen/vitest.e2e.config.ts`. It extends the e2e preset in OOCE's workspace-config, which this repository does not carry. The codegen e2e lane is deferred to MCP-861.

### `packages/graph-corpus-sdk`

- Source: `packages/sdks/graph-corpus-sdk` at `d5846cf6f37270c73291640a526124429369ee97`.
- Copied unchanged: 34 files.
- Modified by the tool: `package.json`, `README.md`, `tsconfig.json`, `tsup.config.ts`, `vitest.config.ts`.
- Modified `README.md`. Documents the supplied ./store and ./load exports and pnpm graph:refresh.
- Modified `tsup.config.ts`. The supplied snapshot store under src/store is built into dist for the ./store export.
- Supplied from this repository: `src/load.integration.test.ts`, `src/load.ts`, `src/store/index.ts`, `src/store/object-store.ts`, `src/store/snapshot-store.integration.test.ts`, `src/store/snapshot-store.ts`.
- Dropped `packages/sdks/graph-corpus-sdk/eslint.config.ts`. The root eslint.config.ts lints packages/**.

### `packages/curriculum-sdk`

- Source: `packages/sdks/oak-curriculum-sdk` at `d5846cf6f37270c73291640a526124429369ee97`.
- Copied unchanged: 187 files.
- Modified by the tool: `docs/architecture.md`, `docs/logging-guide.md`, `docs/mcp/README.md`, `package.json`, `README.md`, `src/types/helpers/type-helpers.ts`, `tsconfig.json`, `tsconfig.lint.json`, `tsup.config.ts`.
- Modified `docs/logging-guide.md`. The HTTP server has not moved yet, so the link points at its OOCE README at the pinned SHA.
- Modified `docs/logging-guide.md`. The logger package moved to packages/logger in this repository.
- Modified `docs/mcp/README.md`. The list continues after an unindented code block, which the repository's markdownlint rejects. The disable pair keeps OOCE's text and rendering.
- Modified `tsconfig.json`. ESLint's typed rules resolve each file through the package tsconfig.json, so it must cover the client example.
- Modified `tsconfig.lint.json`. The type-check covers the client example too, as the repository's type-check coverage test requires. It type-checks clean.
- Supplied from this repository: `src/types/helpers/type-safe.ts`.
- Dropped `packages/sdks/oak-curriculum-sdk/eslint.config.ts`. The root eslint.config.ts lints packages/**.

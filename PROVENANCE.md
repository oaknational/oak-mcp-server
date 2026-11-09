# Provenance

This repository's code is imported from the `oak-open-curriculum-ecosystem` repository (OOCE) by the import tool, never by hand.

Pinned OOCE import SHA: `d5846cf6f37270c73291640a526124429369ee97`

## What an entry records

Each entry records one import from OOCE. It names the destination path in this repository, the source path in OOCE, the pinned SHA the file was read at, and a hash of the imported content.

Only the import tool writes entries. Nobody edits the entries by hand. A pull request that changes an entry without running the tool fails review.

## Entries

### `packages/result`

- Source: `packages/core/result` at `d5846cf6f37270c73291640a526124429369ee97`.
- Copied unchanged: 6 files.
- Modified by the tool: `package.json`, `src/unwrapping.ts`, `tsconfig.json`, `tsup.config.ts`, `vitest.config.ts`.
- Dropped `packages/core/result/eslint.config.ts`. The root eslint.config.ts lints packages/**.

### `packages/observability`

- Source: `packages/core/observability` at `d5846cf6f37270c73291640a526124429369ee97`.
- Copied unchanged: 16 files.
- Modified by the tool: `package.json`, `README.md`, `src/json-sanitisation.ts`, `src/redaction.ts`, `src/redaction.unit.test.ts`, `tsconfig.json`, `tsup.config.ts`, `vitest.config.ts`.
- Supplied from this repository: `src/type-safe.ts`.
- Dropped `packages/core/observability/eslint.config.ts`. The root eslint.config.ts lints packages/**.

### `packages/env`

- Source: `packages/core/env`, `packages/libs/env-resolution` at `d5846cf6f37270c73291640a526124429369ee97`.
- Copied unchanged: 21 files.
- Modified by the tool: `package.json`, `README.md`, `src/index.ts`, `src/resolution/README.md`, `src/root-package-version.ts`, `src/schemas/observability.ts`, `src/schemas/observability.unit.test.ts`, `tests/resolution/app-root.integration.test.ts`, `tests/resolution/repo-root.integration.test.ts`, `tests/resolution/resolve-env.integration.test.ts`, `tests/resolution/warnings-channel.unit.test.ts`, `tests/root-package-version.unit.test.ts`, `tests/schemas/sentry.unit.test.ts`, `tsconfig.json`, `tsup.config.ts`, `vitest.config.ts`.
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
- Copied unchanged: 34 files.
- Modified by the tool: `package.json`, `src/error-normalisation-fields.ts`, `src/error-normalisation.unit.test.ts`, `tsconfig.json`, `tsup.config.ts`, `vitest.config.ts`.
- Supplied from this repository: `src/type-safe.ts`.
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
- Copied unchanged: 34 files.
- Modified by the tool: `package.json`, `src/event-policy.integration.test.ts`, `src/mcp-transport-observer-collaborator.integration.test.ts`, `src/product-analytics-sink.integration.test.ts`, `tsconfig.json`, `tsup.config.ts`, `vitest.config.ts`.
- Dropped `packages/libs/posthog-node/eslint.config.ts`. The root eslint.config.ts lints packages/**.

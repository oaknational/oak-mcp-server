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
- Copied unchanged: 378 files.
- Modified by the tool: `code-generation/codegen-core.ts`, `code-generation/codegen.ts`, `code-generation/test-fixtures.ts`, `code-generation/typegen/bulk/generate-bulk-schemas.ts`, `code-generation/typegen/index.ts`, `package.json`, `README.md`, `reference/README.md`, `src/index.ts`, `src/synonym-export.ts`, `src/synonyms/README.md`, `src/types/helpers/type-helpers.ts`, `src/zod.ts`, `tsconfig.json`, `tsconfig.lint.json`, `tsup.config.ts`.
- Modified `code-generation/codegen-core.ts`. The search, admin-stream, query-parser and zero-hit generators moved to packages/search (P11).
- Modified `code-generation/codegen.ts`. The search, admin-stream, query-parser and zero-hit generators moved to packages/search (P11).
- Modified `code-generation/test-fixtures.ts`. The example path matches the pre-commit personal-data scrub pattern for home directories, so it is renamed. No test reads it.
- Modified `code-generation/typegen/index.ts`. The search, admin-stream, query-parser and zero-hit generators moved to packages/search (P11).
- Modified `reference/README.md`. The link points at this repository's root .gitignore, which carries the same reference rule, one level nearer than in OOCE.
- Modified `src/index.ts`. The search, admin-stream, query-parser and zero-hit generators moved to packages/search (P11).
- Modified `src/synonyms/README.md`. The search app stays in OOCE, so the link points at its file at the pinned SHA.
- Modified `src/zod.ts`. The search, admin-stream, query-parser and zero-hit generators moved to packages/search (P11).
- Modified `tsconfig.lint.json`. The type-check covers the generated vocab modules too, as the repository's type-check coverage test requires. They type-check clean.
- Supplied from this repository: `prettier.config.mjs`, `src/types/helpers/type-safe.ts`, `tests/drift.test.ts`.
- Dropped `packages/sdks/oak-sdk-codegen/code-generation/typegen/admin/` (2 files). Moved to packages/search with the search SDK (P11).
- Dropped `packages/sdks/oak-sdk-codegen/code-generation/typegen/observability/` (2 files). Moved to packages/search with the search SDK (P11).
- Dropped `packages/sdks/oak-sdk-codegen/code-generation/typegen/query-parser/`. Moved to packages/search with the search SDK (P11).
- Dropped `packages/sdks/oak-sdk-codegen/code-generation/typegen/search/` (54 files). Moved to packages/search with the search SDK (P11).
- Dropped `packages/sdks/oak-sdk-codegen/e2e-tests/scripts/codegen-core.e2e.test.ts`. Its config is dropped. The codegen e2e lane is deferred to MCP-861.
- Dropped `packages/sdks/oak-sdk-codegen/eslint.config.ts`. The root eslint.config.ts lints packages/**.
- Dropped `packages/sdks/oak-sdk-codegen/src/admin.ts`. Moved to packages/search with the search SDK (P11).
- Dropped `packages/sdks/oak-sdk-codegen/src/observability.ts`. Moved to packages/search with the search SDK (P11).
- Dropped `packages/sdks/oak-sdk-codegen/src/query-parser.ts`. Moved to packages/search with the search SDK (P11).
- Dropped `packages/sdks/oak-sdk-codegen/src/search.ts`. Moved to packages/search with the search SDK (P11).
- Dropped `packages/sdks/oak-sdk-codegen/src/types/generated/admin/` (2 files). Moved to packages/search with the search SDK (P11).
- Dropped `packages/sdks/oak-sdk-codegen/src/types/generated/observability/` (2 files). Moved to packages/search with the search SDK (P11).
- Dropped `packages/sdks/oak-sdk-codegen/src/types/generated/query-parser/`. Moved to packages/search with the search SDK (P11).
- Dropped `packages/sdks/oak-sdk-codegen/src/types/generated/search/` (26 files). Moved to packages/search with the search SDK (P11).
- Dropped `packages/sdks/oak-sdk-codegen/src/types/generated/zod/search/` (3 files). Moved to packages/search with the search SDK (P11).
- Dropped `packages/sdks/oak-sdk-codegen/vitest.e2e.config.ts`. It extends the e2e preset in OOCE's workspace-config, which this repository does not carry. The codegen e2e lane is deferred to MCP-861.

### `packages/graph-corpus-sdk`

- Source: `packages/sdks/graph-corpus-sdk` at `d5846cf6f37270c73291640a526124429369ee97`.
- Copied unchanged: 34 files.
- Modified by the tool: `package.json`, `README.md`, `tsconfig.json`, `tsup.config.ts`, `vitest.config.ts`.
- Dropped `packages/sdks/graph-corpus-sdk/eslint.config.ts`. The root eslint.config.ts lints packages/**.

### `packages/search`

- Source: `packages/sdks/oak-search-sdk`, `packages/libs/search-contracts`, `packages/sdks/oak-sdk-codegen` at `d5846cf6f37270c73291640a526124429369ee97`.
- Copied unchanged: 148 files.
- Modified by the tool: `code-generation/typegen/search/generate-search-facet-types.ts`, `code-generation/typegen/search/generate-search-facet-zod.ts`, `code-generation/typegen/search/generate-search-index-docs.ts`, `code-generation/typegen/search/generate-search-requests.ts`, `code-generation/typegen/search/generate-search-responses.ts`, `code-generation/typegen/search/generate-search-suggestions.ts`, `package.json`, `README.md`, `src/admin/admin-index-operations.ts`, `src/admin/alias-operations.ts`, `src/admin/index-meta-mapping-contract.ts`, `src/admin/index-meta.ts`, `src/admin/lifecycle-meta-alias-coherence.ts`, `src/admin/lifecycle-rollback.ts`, `src/admin/lifecycle-swap-builders.ts`, `src/admin/versioned-index-operations.ts`, `src/contract.ts`, `src/contracts/field-inventory.ts`, `src/create-search-sdk.integration.test.ts`, `src/observability/create-observability-service.ts`, `src/observability/zero-hit-telemetry.ts`, `src/retrieval/create-retrieval-service.ts`, `src/retrieval/rrf-query-helpers.ts`, `src/retrieval/rrf-score-processing.ts`, `src/retrieval/rrf-score-processing.unit.test.ts`, `src/retrieval/search-field-integrity.integration.test.ts`, `src/retrieval/search-field-integrity.unit.test.ts`, `src/retrieval/search-sequences.integration.test.ts`, `src/retrieval/search-sequences.ts`, `src/retrieval/search-threads.ts`, `src/retrieval/sequence-facets.integration.test.ts`, `src/retrieval/sequence-facets.ts`, `src/retrieval/suggest-bool-prefix.ts`, `src/retrieval/suggest-completion.ts`, `src/retrieval/suggestions.integration.test.ts`, `src/retrieval/suggestions.ts`, `src/retrieval/unit-doc-mapper.ts`, `src/types/admin.ts`, `src/types/generated/search/facets.ts`, `src/types/generated/search/index-documents.ts`, `src/types/generated/search/natural-requests.ts`, `src/types/generated/search/parsed-query.ts`, `src/types/generated/search/requests.ts`, `src/types/generated/search/responses.lessons.ts`, `src/types/generated/search/responses.units.ts`, `src/types/generated/search/suggestions.ts`, `src/types/generated/zod/search/output/sequence-facets.ts`, `src/types/index-lifecycle-types.ts`, `src/types/observability.ts`, `src/types/retrieval-params.ts`, `src/types/retrieval-results.ts`, `src/types/retrieval.ts`, `tsconfig.json`, `tsconfig.lint.json`, `tsup.config.ts`, `vitest.config.ts`.
- Modified `README.md`. Prettier aligns the service table, which is misaligned in OOCE.
- Modified `README.md`. States the boundary and the planned move to oak-semantic-search (P11).
- Modified `README.md`. The search CLI stays in OOCE, so the link points at its file at the pinned SHA.
- Modified `code-generation/typegen/search/generate-search-facet-types.ts`. The generated API schema stays in packages/codegen, so the search modules and their generators import it by package name.
- Modified `code-generation/typegen/search/generate-search-facet-zod.ts`. The generated API schema stays in packages/codegen, so the search modules and their generators import it by package name.
- Modified `code-generation/typegen/search/generate-search-index-docs.ts`. The generated API schema stays in packages/codegen, so the search modules and their generators import it by package name.
- Modified `code-generation/typegen/search/generate-search-requests.ts`. The generated API schema stays in packages/codegen, so the search modules and their generators import it by package name.
- Modified `code-generation/typegen/search/generate-search-responses.ts`. The generated API schema stays in packages/codegen, so the search modules and their generators import it by package name.
- Modified `code-generation/typegen/search/generate-search-suggestions.ts`. The generated API schema stays in packages/codegen, so the search modules and their generators import it by package name.
- Modified `src/admin/admin-index-operations.ts`. The search codegen barrel moved into this package as src/contract.ts.
- Modified `src/admin/alias-operations.ts`. The helpers come from a supplied copy, as in the other moved packages.
- Modified `src/admin/index-meta-mapping-contract.ts`. The search codegen barrel moved into this package as src/contract.ts.
- Modified `src/admin/index-meta.ts`. The search codegen barrel moved into this package as src/contract.ts.
- Modified `src/admin/lifecycle-meta-alias-coherence.ts`. The helpers come from a supplied copy, as in the other moved packages.
- Modified `src/admin/lifecycle-rollback.ts`. The search codegen barrel moved into this package as src/contract.ts.
- Modified `src/admin/lifecycle-swap-builders.ts`. The search codegen barrel moved into this package as src/contract.ts.
- Modified `src/admin/versioned-index-operations.ts`. The helpers come from a supplied copy, as in the other moved packages.
- Modified `src/contract.ts`. The barrel is this package's contract entry point.
- Modified `src/contract.ts`. curriculum-sdk took these two schemas from `@oaknational/sdk-codegen/zod`, whose search part moved here.
- Modified `src/contracts/field-inventory.ts`. The helpers come from a supplied copy, as in the other moved packages.
- Modified `src/contracts/field-inventory.ts`. The search codegen barrel moved into this package as src/contract.ts.
- Modified `src/create-search-sdk.integration.test.ts`. The search codegen barrel moved into this package as src/contract.ts.
- Modified `src/observability/create-observability-service.ts`. The zero-hit codegen moved into this package.
- Modified `src/observability/zero-hit-telemetry.ts`. The zero-hit codegen moved into this package.
- Modified `src/retrieval/create-retrieval-service.ts`. The search codegen barrel moved into this package as src/contract.ts.
- Modified `src/retrieval/rrf-query-helpers.ts`. The search codegen barrel moved into this package as src/contract.ts.
- Modified `src/retrieval/rrf-score-processing.ts`. The search codegen barrel moved into this package as src/contract.ts.
- Modified `src/retrieval/rrf-score-processing.unit.test.ts`. The search codegen barrel moved into this package as src/contract.ts.
- Modified `src/retrieval/search-field-integrity.integration.test.ts`. The search codegen barrel moved into this package as src/contract.ts.
- Modified `src/retrieval/search-field-integrity.integration.test.ts`. search-contracts merged into this package as src/contracts.
- Modified `src/retrieval/search-field-integrity.unit.test.ts`. search-contracts merged into this package as src/contracts.
- Modified `src/retrieval/search-sequences.integration.test.ts`. The search codegen barrel moved into this package as src/contract.ts.
- Modified `src/retrieval/search-sequences.ts`. The helpers come from a supplied copy, as in the other moved packages.
- Modified `src/retrieval/search-sequences.ts`. The search codegen barrel moved into this package as src/contract.ts.
- Modified `src/retrieval/search-threads.ts`. The search codegen barrel moved into this package as src/contract.ts.
- Modified `src/retrieval/sequence-facets.integration.test.ts`. The search codegen barrel moved into this package as src/contract.ts.
- Modified `src/retrieval/sequence-facets.ts`. The search codegen barrel moved into this package as src/contract.ts.
- Modified `src/retrieval/suggest-bool-prefix.ts`. The search codegen barrel moved into this package as src/contract.ts.
- Modified `src/retrieval/suggest-completion.ts`. The search codegen barrel moved into this package as src/contract.ts.
- Modified `src/retrieval/suggestions.integration.test.ts`. The search codegen barrel moved into this package as src/contract.ts.
- Modified `src/retrieval/suggestions.ts`. The search codegen barrel moved into this package as src/contract.ts.
- Modified `src/retrieval/unit-doc-mapper.ts`. The search codegen barrel moved into this package as src/contract.ts.
- Modified `src/types/admin.ts`. The search codegen barrel moved into this package as src/contract.ts.
- Modified `src/types/generated/search/facets.ts`. The generated API schema stays in packages/codegen, so the search modules and their generators import it by package name.
- Modified `src/types/generated/search/index-documents.ts`. The generated API schema stays in packages/codegen, so the search modules and their generators import it by package name.
- Modified `src/types/generated/search/natural-requests.ts`. The generated API schema stays in packages/codegen, so the search modules and their generators import it by package name.
- Modified `src/types/generated/search/parsed-query.ts`. The generated API schema stays in packages/codegen, so the search modules and their generators import it by package name.
- Modified `src/types/generated/search/requests.ts`. The generated API schema stays in packages/codegen, so the search modules and their generators import it by package name.
- Modified `src/types/generated/search/responses.lessons.ts`. The generated API schema stays in packages/codegen, so the search modules and their generators import it by package name.
- Modified `src/types/generated/search/responses.units.ts`. The generated API schema stays in packages/codegen, so the search modules and their generators import it by package name.
- Modified `src/types/generated/search/suggestions.ts`. The generated API schema stays in packages/codegen, so the search modules and their generators import it by package name.
- Modified `src/types/generated/zod/search/output/sequence-facets.ts`. The generated API schema stays in packages/codegen, so the search modules and their generators import it by package name.
- Modified `src/types/index-lifecycle-types.ts`. The search codegen barrel moved into this package as src/contract.ts.
- Modified `src/types/observability.ts`. The zero-hit codegen moved into this package.
- Modified `src/types/retrieval-params.ts`. The search codegen barrel moved into this package as src/contract.ts.
- Modified `src/types/retrieval-results.ts`. The search codegen barrel moved into this package as src/contract.ts.
- Modified `src/types/retrieval.ts`. The search codegen barrel moved into this package as src/contract.ts.
- Modified `tsconfig.json`. The type-check covers the moved search generators and the tests directory.
- Modified `tsconfig.lint.json`. The type-check covers the moved search generators and the tests directory.
- Modified `tsup.config.ts`. The build emits the contract barrel and the merged search-contracts modules.
- Modified `vitest.config.ts`. The moved search generators keep their tests under code-generation, and the contract and drift tests live under tests.
- Kept OOCE's relative paths in `code-generation/typegen/search/generate-search-index-docs.ts`. The ../../../../docs/ paths are output paths into the package's own generated docs folder, not links into OOCE.
- Kept OOCE's relative paths in `code-generation/typegen/search/generate-search-modules.unit.test.ts`. The ../../../../docs/ paths are output paths into the package's own generated docs folder, not links into OOCE.
- Kept OOCE's relative paths in `code-generation/typegen/search/generate-search-response-docs.ts`. The ../../../../docs/ paths are output paths into the package's own generated docs folder, not links into OOCE.
- Supplied from this repository: `code-generation/searchgen.ts`, `prettier.config.mjs`, `src/type-safe.ts`, `tests/contract.test.ts`, `tests/drift.test.ts`.
- Dropped `packages/sdks/oak-search-sdk/eslint.config.ts`. The root eslint.config.ts lints packages/**.
- Dropped `packages/libs/search-contracts/eslint.config.ts`. The root eslint.config.ts lints packages/**.
- Dropped `packages/libs/search-contracts/package.json`. Dependencies merged into the search package.json.
- Dropped `packages/libs/search-contracts/tsconfig.build.json`. The search package's own file covers the merged tree.
- Dropped `packages/libs/search-contracts/tsconfig.json`. The search package's own file covers the merged tree.
- Dropped `packages/libs/search-contracts/tsconfig.lint.json`. The search package's own file covers the merged tree.
- Dropped `packages/libs/search-contracts/tsup.config.ts`. The search package's own file covers the merged tree.
- Dropped `packages/libs/search-contracts/vitest.config.ts`. The search package's own file covers the merged tree.

### `packages/curriculum-sdk`

- Source: `packages/sdks/oak-curriculum-sdk` at `d5846cf6f37270c73291640a526124429369ee97`.
- Copied unchanged: 174 files.
- Modified by the tool: `docs/architecture.md`, `docs/logging-guide.md`, `docs/mcp/README.md`, `package.json`, `README.md`, `src/elasticsearch.ts`, `src/index.ts`, `src/mcp/aggregated-browse/execution.integration.test.ts`, `src/mcp/aggregated-browse/execution.ts`, `src/mcp/aggregated-browse/formatting.ts`, `src/mcp/aggregated-browse/formatting.unit.test.ts`, `src/mcp/ontology-data.ts`, `src/mcp/ontology-data.unit.test.ts`, `src/mcp/search-retrieval-types.ts`, `src/types/helpers/type-helpers.ts`, `src/types/index.ts`, `src/validation/search-response-validators.ts`, `src/validation/search-response-validators.unit.test.ts`, `src/validation/types.ts`, `tsconfig.json`, `tsconfig.lint.json`, `tsup.config.ts`.
- Modified `docs/logging-guide.md`. The HTTP server has not moved yet, so the link points at its OOCE README at the pinned SHA.
- Modified `docs/logging-guide.md`. The logger package moved to packages/logger in this repository.
- Modified `docs/mcp/README.md`. The list continues after an unindented code block, which the repository's markdownlint rejects. The disable pair keeps OOCE's text and rendering.
- Modified `src/elasticsearch.ts`. The search codegen moved to packages/search, which exposes it to other packages only as `@oaknational/oak-search-sdk/contract` (P11).
- Modified `src/index.ts`. The search codegen moved to packages/search, which exposes it to other packages only as `@oaknational/oak-search-sdk/contract` (P11).
- Modified `src/mcp/aggregated-browse/execution.integration.test.ts`. The search codegen moved to packages/search, which exposes it to other packages only as `@oaknational/oak-search-sdk/contract` (P11).
- Modified `src/mcp/aggregated-browse/execution.ts`. The search codegen moved to packages/search, which exposes it to other packages only as `@oaknational/oak-search-sdk/contract` (P11).
- Modified `src/mcp/aggregated-browse/formatting.ts`. The search codegen moved to packages/search, which exposes it to other packages only as `@oaknational/oak-search-sdk/contract` (P11).
- Modified `src/mcp/aggregated-browse/formatting.unit.test.ts`. The search codegen moved to packages/search, which exposes it to other packages only as `@oaknational/oak-search-sdk/contract` (P11).
- Modified `src/mcp/ontology-data.ts`. The search codegen moved to packages/search, which exposes it to other packages only as `@oaknational/oak-search-sdk/contract` (P11).
- Modified `src/mcp/ontology-data.unit.test.ts`. The search codegen moved to packages/search, which exposes it to other packages only as `@oaknational/oak-search-sdk/contract` (P11).
- Modified `src/mcp/search-retrieval-types.ts`. The search codegen moved to packages/search, which exposes it to other packages only as `@oaknational/oak-search-sdk/contract` (P11).
- Modified `src/types/index.ts`. The search codegen moved to packages/search, which exposes it to other packages only as `@oaknational/oak-search-sdk/contract` (P11).
- Modified `src/validation/search-response-validators.ts`. The search codegen moved to packages/search, which exposes it to other packages only as `@oaknational/oak-search-sdk/contract` (P11).
- Modified `src/validation/search-response-validators.unit.test.ts`. The search codegen moved to packages/search, which exposes it to other packages only as `@oaknational/oak-search-sdk/contract` (P11).
- Modified `src/validation/types.ts`. The search codegen moved to packages/search, which exposes it to other packages only as `@oaknational/oak-search-sdk/contract` (P11).
- Modified `tsconfig.json`. ESLint's typed rules resolve each file through the package tsconfig.json, so it must cover the client example.
- Modified `tsconfig.lint.json`. The type-check covers the client example too, as the repository's type-check coverage test requires. It type-checks clean.
- Supplied from this repository: `src/types/helpers/type-safe.ts`.
- Dropped `packages/sdks/oak-curriculum-sdk/eslint.config.ts`. The root eslint.config.ts lints packages/**.

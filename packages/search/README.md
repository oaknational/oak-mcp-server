# @oaknational/oak-search-sdk

TypeScript SDK for Oak semantic search — retrieval, admin, and observability services backed by Elasticsearch.

This package is one of the repo's modular building blocks for AI education products: it explores how hybrid semantic search can complement structured APIs, MCP and MCP Apps, and Oak knowledge graph surfaces while keeping Elasticsearch-specific retrieval logic behind typed SDK boundaries.

## Boundary in this repository

This package moves to its own `oak-semantic-search` repository under ADR-231, Rollout item 2. Until then, the rest of this repository uses it only through two seams:

- `SearchRetrievalService` in `@oaknational/curriculum-sdk`, the contract that the search tools call.
- `@oaknational/oak-search-sdk/contract`, the generated search request, response and index-document types and schemas that the contract is written in.

The server builds the service from this package in one composition-root file, `apps/server/src/composition/search.ts`. The move to `oak-semantic-search` replaces only that adapter. A rule in the root `eslint.config.ts` rejects any other import of this package from outside `packages/search`.

This package also owns the search code generators under `code-generation/`. They read the schema that `packages/codegen` generates, so `pnpm codegen` runs them after it.

## Usage

```typescript
import { createRetrievalService } from '@oaknational/oak-search-sdk/read';
import { createAdminService } from '@oaknational/oak-search-sdk/admin';
import { Client } from '@elastic/elasticsearch';

const esClient = new Client({ node: esUrl, auth: { apiKey } });
const config = {
  indexTarget: 'primary' as const,
  indexVersion: '1',
};
const retrieval = createRetrievalService(esClient, config);
const admin = createAdminService(esClient, config);

// Search lessons (4-way RRF: BM25 + ELSER on Content and Structure)
const results = await retrieval.searchLessons({
  query: 'expanding brackets',
  subject: 'maths',
  keyStage: 'ks3',
});

// Search threads (2-way RRF: BM25 on thread_title + ELSER on thread_semantic)
const threads = await retrieval.searchThreads({
  query: 'algebra equations progression',
  subject: 'maths',
});
// threads.ok → { scope: 'threads', results: ThreadResult[], total, took, timedOut }

// Admin operations
await admin.setup();
const status = await admin.verifyConnection();
```

## Capability Surfaces (ADR-134)

The package exposes explicit subpath capability surfaces:

- `@oaknational/oak-search-sdk/read` - retrieval and observability-safe exports
- `@oaknational/oak-search-sdk/admin` - privileged admin/lifecycle/write exports
- `@oaknational/oak-search-sdk` (root) - read-safe default only

Consumers should import from `read` or `admin` directly based on capability.
App code must never import internal/deep implementation paths.
Shared index resolver primitives (`SEARCH_INDEX_KINDS`, `resolveSearchIndexName`, related types) are
part of the public `/read` surface and may be reused by admin consumers via public exports.

The SDK service families are exposed via those capability surfaces:

| Service                  | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **RetrievalService**     | Hybrid BM25 + ELSER search (lessons, units, threads) plus current lexical-only sequence retrieval, suggestions, and facets. Lessons/units use 4-way RRF; threads use 2-way RRF; sequences stay lexical-only until `sequence_semantic` is populated ([ADR-110](https://github.com/oaknational/oak-open-curriculum-ecosystem/blob/d5846cf6f37270c73291640a526124429369ee97/docs/architecture/architectural-decisions/110-thread-search-architecture.md)) |
| **AdminService**         | ES setup, connection, synonyms, index metadata                                                                                                                                                                                                                                                                                                                                                                                                         |
| **ObservabilityService** | Zero-hit event recording, ES persistence, telemetry queries                                                                                                                                                                                                                                                                                                                                                                                            |

### Blue/Green Index Lifecycle (ADR-130)

A separate `IndexLifecycleService` provides zero-downtime index management:

```typescript
import { buildLifecycleDeps, createIndexLifecycleService } from '@oaknational/oak-search-sdk/admin';
import { Client } from '@elastic/elasticsearch';

const client = new Client({ node: esUrl, auth: { apiKey } });
const runVersionedIngest = createRunVersionedIngest({
  oakClient,
  esTransport: client,
  target: 'primary',
});
const deps = buildLifecycleDeps(client, 'primary', runVersionedIngest);
const lifecycle = createIndexLifecycleService(deps);

// Full blue/green cycle: create versioned indexes → ingest → verify → swap aliases → clean up
const result = await lifecycle.versionedIngest({ bulkDir: '/path/to/bulk', verbose: true });

// Or stage and promote separately — inspect before going live
const staged = await lifecycle.stage({ bulkDir: '/path/to/bulk', verbose: true });
if (staged.ok) {
  const promoted = await lifecycle.promote(staged.value.version);
}

// Roll back to previous version
const rollback = await lifecycle.rollback();

// Check alias health
const validation = await lifecycle.validateAliases();
```

Key properties:

- **Atomic swap**: All six curriculum aliases swapped in a single `POST /_aliases` request
- **Single-level rollback**: `previous_version` metadata enables instant revert
- **Admin-layer only**: Retrieval consumers are unaffected — they query alias names as before
- **DI-based**: `buildLifecycleDeps` wires SDK functions into an `IndexLifecycleDeps` interface for testability

### Design Principles

- **Dependency injection**: The consuming application supplies the Elasticsearch client, optional logger, and configuration. The SDK never reads `process.env`.
- **Schema-first types**: Search request/response/index document types flow from `@oaknational/sdk-codegen` generated artefacts. No manual type definitions.
- **Deterministic**: NL parsing and intent extraction are the responsibility of the MCP layer, not the SDK. See [ADR-107](https://github.com/oaknational/oak-open-curriculum-ecosystem/blob/d5846cf6f37270c73291640a526124429369ee97/docs/architecture/architectural-decisions/107-deterministic-sdk-nl-in-mcp-boundary.md).
- **Evaluation belongs in the CLI, not the SDK**: Ground truths, benchmarks, validation, and experiments are operator tooling _about_ the search, not the search itself. Evaluation code lives in `apps/oak-search-cli/` and consumes SDK retrieval services via DI.

## Consumers

| Consumer       | Location                 | How it uses the SDK                                            |
| -------------- | ------------------------ | -------------------------------------------------------------- |
| **Search CLI** | `apps/oak-search-cli/`   | Creates ES client from env, composes SDK with explicit cleanup |
| **MCP Server** | (Checkpoint F — planned) | Will call SDK services from MCP tools                          |

## Development

```bash
pnpm build        # Build with tsup + dts
pnpm type-check   # Type check
pnpm lint:fix     # Lint
pnpm test         # Run tests (across 15 test files)
```

## Related

- Search CLI workspace: `apps/oak-search-cli/`
- [Search CLI Architecture](https://github.com/oaknational/oak-open-curriculum-ecosystem/blob/d5846cf6f37270c73291640a526124429369ee97/apps/oak-search-cli/docs/ARCHITECTURE.md)
- [ADR-110: Thread Search Architecture](https://github.com/oaknational/oak-open-curriculum-ecosystem/blob/d5846cf6f37270c73291640a526124429369ee97/docs/architecture/architectural-decisions/110-thread-search-architecture.md)
- [ADR-107: Deterministic SDK / NL-in-MCP Boundary](https://github.com/oaknational/oak-open-curriculum-ecosystem/blob/d5846cf6f37270c73291640a526124429369ee97/docs/architecture/architectural-decisions/107-deterministic-sdk-nl-in-mcp-boundary.md)
- [ADR-130: Blue/Green Index Swapping](https://github.com/oaknational/oak-open-curriculum-ecosystem/blob/d5846cf6f37270c73291640a526124429369ee97/docs/architecture/architectural-decisions/130-blue-green-index-swapping.md)
- SDK + CLI historical plan:
  `.agent/plans/semantic-search/archive/completed/search-sdk-cli.plan.md`

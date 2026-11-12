# @oaknational/graph-corpus-sdk

Oak's typed corpus SDK for the graph substrate. It is the substrate home for
Oak's open-education corpora
([ADR-157](https://github.com/oaknational/oak-open-curriculum-ecosystem/blob/d5846cf6f37270c73291640a526124429369ee97/docs/architecture/architectural-decisions/157-multi-source-open-education-integration.md));
the EEF Teaching and Learning Toolkit strands foundation is the first
resident. Every type derives directly from the fixed `as const` corpus
snapshot: the corpus is the single source of truth and its own type
authority.

Transport-agnostic per
[ADR-179](https://github.com/oaknational/oak-open-curriculum-ecosystem/blob/d5846cf6f37270c73291640a526124429369ee97/docs/architecture/architectural-decisions/179-transport-agnostic-graph-substrate.md):
this package ships no MCP, HTTP, or CLI types. Surfacing graph capability
through any transport is a consumer-side concern handled by the curriculum
SDK MCP module and the curriculum MCP HTTP app, or by future consumer
workspaces that import this SDK.

## What it provides

The `eef-strands` module is the typed raw-data foundation over
`EEF_TOOLKIT_DATA`, the fixed `as const` corpus snapshot:

- **Strand identity and lookup** — `EefStrand`, `EefStrandId`,
  `EefStrandById`, `strandById`, and the single boundary predicate
  `isValidStrandKey`.
- **Finite raw domains** — the observed applicability domains, the declared
  metadata domains, the declared-vs-observed divergence record, and the raw
  headline-metric domains.
- **Raw edge facts** — `relatedStrandEdges`, derived from each strand's
  `related_strands`.
- **Corpus-level provenance** — `corpusMeta`, `corpusCaveats`,
  `corpusMethodology`, `lastUpdated`.

The graph-native projection, graph query layer, and MCP schemas are built
downstream in their consumer layers; this package owns the corpus types
only.

## Architectural decisions

- [ADR-154](https://github.com/oaknational/oak-open-curriculum-ecosystem/blob/d5846cf6f37270c73291640a526124429369ee97/docs/architecture/architectural-decisions/154-separate-framework-from-consumer.md)
  — framework / consumer separation.
- [ADR-157](https://github.com/oaknational/oak-open-curriculum-ecosystem/blob/d5846cf6f37270c73291640a526124429369ee97/docs/architecture/architectural-decisions/157-multi-source-open-education-integration.md)
  — multi-source open-education integration.
- [ADR-173](https://github.com/oaknational/oak-open-curriculum-ecosystem/blob/d5846cf6f37270c73291640a526124429369ee97/docs/architecture/architectural-decisions/173-graph-stack-topology.md)
  — graph stack topology.
- [ADR-179](https://github.com/oaknational/oak-open-curriculum-ecosystem/blob/d5846cf6f37270c73291640a526124429369ee97/docs/architecture/architectural-decisions/179-transport-agnostic-graph-substrate.md)
  — transport-agnostic graph substrate.

## Sub-path exports

- `@oaknational/graph-corpus-sdk` — root barrel; re-exports the foundational
  `GraphView` (from `@oaknational/graph-core`) and `Result` (from
  `@oaknational/result`) types.
- `@oaknational/graph-corpus-sdk/eef-strands` — the EEF strands corpus
  foundation.
- `@oaknational/graph-corpus-sdk/store` — the graph corpus snapshot store,
  over a local directory or Vercel Blob.
- `@oaknational/graph-corpus-sdk/load` — the lazy, TTL-cached corpus loader,
  which returns a typed error when the corpus cannot load.

## Refreshing the corpus

`pnpm graph:refresh` builds the corpus from the Oak bulk download and writes
`graph-corpus/v<schemaVersion>/latest.json` plus a dated copy, keeping the
newest eight. It refuses to write, and prints the guard's name, when
`OAK_API_KEY` is missing, the download fails, a bulk file does not parse, the
corpus is empty, or the node or edge count falls below
`GRAPH_MIN_RETENTION_RATIO` (default 0.5) of the stored corpus.

```bash
pnpm graph:refresh --store local                   # fetch with OAK_API_KEY
pnpm graph:refresh --store local --bulk-dir <dir>  # build from a downloaded bulk directory
pnpm graph:refresh --store blob                    # write to Vercel Blob
```

| Variable                    | Purpose                                                                                                                                                  |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GRAPH_CORPUS_LOCAL_PATH`   | Local store root, for the refresh and the loader. Defaults to `.cache/graph-corpus` for the refresh. When set, the loader reads from it instead of Blob. |
| `BLOB_READ_WRITE_TOKEN`     | Vercel Blob token for `--store blob` and the loader.                                                                                                     |
| `OAK_BULK_URL`              | Overrides the bulk endpoint.                                                                                                                             |
| `GRAPH_MIN_RETENTION_RATIO` | Retention guard ratio, from 0 to 1.                                                                                                                      |

## Scripts

```bash
pnpm --filter @oaknational/graph-corpus-sdk type-check
pnpm --filter @oaknational/graph-corpus-sdk lint
pnpm --filter @oaknational/graph-corpus-sdk test
pnpm --filter @oaknational/graph-corpus-sdk build
```

## License

MIT

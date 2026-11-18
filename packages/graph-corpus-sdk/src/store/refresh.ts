import { err, isOk, ok, type Result } from '@oaknational/result';
import {
  buildGraphCorpus,
  digestBulkFiles,
  type BulkFiles,
  type RefreshRefusal,
} from '@oaknational/sdk-codegen/graph-refresh';
import type { GraphCorpus } from '@oaknational/sdk-codegen/graph-corpus';

import {
  GRAPH_CORPUS_SCHEMA_VERSION,
  parseGraphCorpusSnapshot,
  type GraphCorpusSnapshotStore,
  type WrittenSnapshot,
} from './snapshot-store.js';

export const DEFAULT_MIN_RETENTION_RATIO = 0.5;

export type { RefreshRefusal } from '@oaknational/sdk-codegen/graph-refresh';

interface RefreshedSnapshot extends WrittenSnapshot {
  readonly status: 'refreshed';
  readonly nodes: number;
  readonly edges: number;
  readonly downloadedAt: string;
  readonly generatedAt: string;
  readonly sourceDigest: string;
}

interface SkippedRefresh {
  readonly status: 'skipped';
  readonly sourceDigest: string;
}

export type RefreshOutcome = RefreshedSnapshot | SkippedRefresh;

interface StoredSummary {
  readonly nodes: number;
  readonly edges: number;
  readonly downloadedAt: string;
  readonly sourceDigest: string | undefined;
}

interface StoredLatest {
  readonly version: string;
  /** `null` when the stored snapshot does not parse. */
  readonly summary: StoredSummary | null;
}

/** Lost compare-and-swap races before a refresh gives up. */
const MAX_WRITE_ATTEMPTS = 5;

async function readStored(
  store: GraphCorpusSnapshotStore,
  log: (line: string) => void,
): Promise<StoredLatest | null> {
  const latest = await store.readLatestVersioned();
  if (latest === null) {
    return null;
  }
  const parsed = parseGraphCorpusSnapshot(latest.body);
  if (!isOk(parsed)) {
    log(`stored snapshot is unreadable, treating it as absent: ${parsed.error}`);
    return { version: latest.version, summary: null };
  }
  return {
    version: latest.version,
    summary: {
      nodes: parsed.value.corpus.stats.totalNodes,
      edges: parsed.value.corpus.stats.totalEdges,
      downloadedAt: parsed.value.downloadedAt,
      sourceDigest: parsed.value.sourceDigest,
    },
  };
}

/**
 * Builds the corpus from `bulk` and writes it, unless the stored snapshot was
 * built from the same data files. Refuses rather than writes an empty corpus,
 * one that falls below `minRetentionRatio` of the stored node or edge count, or
 * one downloaded before the stored snapshot unless `allowRollback` is set.
 * Writes only if `latest.json` is unchanged since it was judged, so when a
 * concurrent refresh writes first, this one judges the new snapshot instead.
 */
export async function refreshGraphCorpus(options: {
  readonly bulk: Result<BulkFiles, RefreshRefusal>;
  readonly store: GraphCorpusSnapshotStore;
  readonly minRetentionRatio?: number;
  readonly allowRollback?: boolean;
  readonly log?: (line: string) => void;
}): Promise<Result<RefreshOutcome, RefreshRefusal>> {
  const log = options.log ?? (() => undefined);
  if (!isOk(options.bulk)) {
    return options.bulk;
  }
  const bulk = options.bulk.value;
  const sourceDigest = await digestBulkFiles(bulk);
  const ratio = options.minRetentionRatio ?? DEFAULT_MIN_RETENTION_RATIO;
  let corpus: GraphCorpus | undefined;
  for (let attempt = 1; attempt <= MAX_WRITE_ATTEMPTS; attempt += 1) {
    const latest = await readStored(options.store, log);
    const stored = latest?.summary ?? null;
    if (stored !== null && stored.sourceDigest === sourceDigest) {
      return ok({ status: 'skipped', sourceDigest });
    }
    if (
      stored !== null &&
      options.allowRollback !== true &&
      Date.parse(bulk.fetchedAt) < Date.parse(stored.downloadedAt)
    ) {
      return err({
        guard: 'older-download',
        message: `the bulk data was downloaded at ${bulk.fetchedAt}, before the stored snapshot's ${stored.downloadedAt}`,
      });
    }
    if (corpus === undefined) {
      const built = await buildGraphCorpus(bulk);
      if (!isOk(built)) {
        return built;
      }
      corpus = built.value;
    }
    const nodes = corpus.stats.totalNodes;
    const edges = corpus.stats.totalEdges;
    if (nodes === 0) {
      return err({ guard: 'empty-corpus', message: 'the new corpus has no nodes' });
    }
    if (stored !== null && (nodes < stored.nodes * ratio || edges < stored.edges * ratio)) {
      return err({
        guard: 'retention',
        message:
          `new corpus has ${String(nodes)} nodes and ${String(edges)} edges, below ${String(ratio)} of the stored ` +
          `${String(stored.nodes)} nodes and ${String(stored.edges)} edges`,
      });
    }
    const written = await options.store.writeIfLatestIs(latest?.version ?? null, {
      schemaVersion: GRAPH_CORPUS_SCHEMA_VERSION,
      downloadedAt: bulk.fetchedAt,
      generatedAt: corpus.generatedAt,
      sourceDigest,
      corpus,
    });
    if (written !== null) {
      return ok({
        status: 'refreshed',
        nodes,
        edges,
        downloadedAt: bulk.fetchedAt,
        generatedAt: corpus.generatedAt,
        sourceDigest,
        ...written,
      });
    }
  }
  throw new Error(
    `latest.json changed ${String(MAX_WRITE_ATTEMPTS)} times while the refresh was writing it`,
  );
}

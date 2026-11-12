import { err, isOk, ok, type Result } from '@oaknational/result';
import {
  buildGraphCorpus,
  digestBulkFiles,
  type BulkFiles,
  type RefreshRefusal,
} from '@oaknational/sdk-codegen/graph-refresh';

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
  readonly sourceDigest: string | undefined;
}

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

async function readStored(
  store: GraphCorpusSnapshotStore,
  log: (line: string) => void,
): Promise<StoredSummary | null> {
  try {
    const text = await store.readLatest();
    if (text === null) {
      return null;
    }
    const parsed = parseGraphCorpusSnapshot(text);
    if (!isOk(parsed)) {
      log(`stored snapshot is unreadable, treating it as absent: ${parsed.error}`);
      return null;
    }
    return {
      nodes: parsed.value.corpus.stats.totalNodes,
      edges: parsed.value.corpus.stats.totalEdges,
      sourceDigest: parsed.value.sourceDigest,
    };
  } catch (error) {
    log(`stored snapshot is unreadable, treating it as absent: ${messageOf(error)}`);
    return null;
  }
}

/**
 * Builds the corpus from `bulk` and writes it, unless the stored snapshot was
 * built from the same data files. Refuses rather than writes an empty corpus or
 * one that falls below `minRetentionRatio` of the stored node or edge count.
 */
export async function refreshGraphCorpus(options: {
  readonly bulk: Result<BulkFiles, RefreshRefusal>;
  readonly store: GraphCorpusSnapshotStore;
  readonly minRetentionRatio?: number;
  readonly log?: (line: string) => void;
}): Promise<Result<RefreshOutcome, RefreshRefusal>> {
  const log = options.log ?? (() => undefined);
  if (!isOk(options.bulk)) {
    return options.bulk;
  }
  const bulk = options.bulk.value;
  const sourceDigest = await digestBulkFiles(bulk);
  const stored = await readStored(options.store, log);
  if (stored !== null && stored.sourceDigest === sourceDigest) {
    return ok({ status: 'skipped', sourceDigest });
  }
  const built = await buildGraphCorpus(bulk);
  if (!isOk(built)) {
    return built;
  }
  const corpus = built.value;
  const nodes = corpus.stats.totalNodes;
  const edges = corpus.stats.totalEdges;
  if (nodes === 0) {
    return err({ guard: 'empty-corpus', message: 'the new corpus has no nodes' });
  }
  const ratio = options.minRetentionRatio ?? DEFAULT_MIN_RETENTION_RATIO;
  if (stored !== null && (nodes < stored.nodes * ratio || edges < stored.edges * ratio)) {
    return err({
      guard: 'retention',
      message:
        `new corpus has ${String(nodes)} nodes and ${String(edges)} edges, below ${String(ratio)} of the stored ` +
        `${String(stored.nodes)} nodes and ${String(stored.edges)} edges`,
    });
  }
  const written = await options.store.write({
    schemaVersion: GRAPH_CORPUS_SCHEMA_VERSION,
    downloadedAt: bulk.fetchedAt,
    generatedAt: corpus.generatedAt,
    sourceDigest,
    corpus,
  });
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

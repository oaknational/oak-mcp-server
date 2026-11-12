import { err, ok, type Result } from '@oaknational/result';
import type { GraphCorpus } from '@oaknational/sdk-codegen/graph-corpus';

import type { ObjectStore } from './object-store.js';

/** Version of the stored snapshot shape. */
export const GRAPH_CORPUS_SCHEMA_VERSION = 1;

/** Dated copies kept beside `latest.json`. */
export const RETAINED_DATED_COPIES = 8;

export interface GraphCorpusSnapshot {
  readonly schemaVersion: number;
  /** When the bulk data was downloaded from the Oak API. */
  readonly downloadedAt: string;
  /** When `vocab-gen` built the corpus. */
  readonly generatedAt: string;
  readonly corpus: GraphCorpus;
}

const PREFIX = `graph-corpus/v${String(GRAPH_CORPUS_SCHEMA_VERSION)}/`;
export const LATEST_KEY = `${PREFIX}latest.json`;
const DATED_KEY = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.json$/;

function datedKey(downloadedAt: string): string {
  return `${PREFIX}${new Date(downloadedAt).toISOString().replace(/[:.]/g, '-')}.json`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isCorpusShaped(value: unknown): value is GraphCorpus {
  return (
    isRecord(value) &&
    Array.isArray(value['nodes']) &&
    Array.isArray(value['edges']) &&
    isRecord(value['stats']) &&
    typeof value['stats']['totalNodes'] === 'number' &&
    typeof value['stats']['totalEdges'] === 'number'
  );
}

/** Parses a stored snapshot, checking the envelope and the schema version. */
export function parseGraphCorpusSnapshot(text: string): Result<GraphCorpusSnapshot, string> {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    return err(`snapshot is not JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!isRecord(value)) {
    return err('snapshot is not an object');
  }
  const { schemaVersion, downloadedAt, generatedAt, corpus } = value;
  if (schemaVersion !== GRAPH_CORPUS_SCHEMA_VERSION) {
    return err(
      `snapshot schemaVersion ${String(schemaVersion)} does not match ${String(GRAPH_CORPUS_SCHEMA_VERSION)}`,
    );
  }
  if (typeof downloadedAt !== 'string' || typeof generatedAt !== 'string') {
    return err('snapshot is missing downloadedAt or generatedAt');
  }
  if (!isCorpusShaped(corpus)) {
    return err('snapshot corpus is missing nodes, edges or stats');
  }
  return ok({ schemaVersion, downloadedAt, generatedAt, corpus });
}

export interface WrittenSnapshot {
  readonly latestKey: string;
  readonly datedKey: string;
  readonly prunedKeys: readonly string[];
}

export interface GraphCorpusSnapshotStore {
  /** The raw `latest.json` text, or `null` when nothing is stored. */
  readLatest(): Promise<string | null>;
  /**
   * Writes the dated copy, then `latest.json`, then deletes all but the
   * newest {@link RETAINED_DATED_COPIES} dated copies.
   */
  write(snapshot: GraphCorpusSnapshot): Promise<WrittenSnapshot>;
}

export function createGraphCorpusSnapshotStore(objects: ObjectStore): GraphCorpusSnapshotStore {
  return {
    readLatest: () => objects.get(LATEST_KEY),
    async write(snapshot) {
      const body = JSON.stringify(snapshot);
      const dated = datedKey(snapshot.downloadedAt);
      await objects.put(dated, body);
      await objects.put(LATEST_KEY, body);
      const datedKeys = (await objects.list(PREFIX))
        .filter((key) => DATED_KEY.test(key.slice(PREFIX.length)))
        .sort();
      const prunedKeys = datedKeys.slice(0, Math.max(0, datedKeys.length - RETAINED_DATED_COPIES));
      await objects.delete(prunedKeys);
      return { latestKey: LATEST_KEY, datedKey: dated, prunedKeys };
    },
  };
}

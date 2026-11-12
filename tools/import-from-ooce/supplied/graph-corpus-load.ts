import { err, isOk, ok, type Result } from '@oaknational/result';

import {
  createGraphCorpusSnapshotStore,
  createObjectStoreFromEnv,
  parseGraphCorpusSnapshot,
  type GraphCorpusSnapshot,
  type GraphCorpusSnapshotStore,
} from './store/index.js';

/** Default time a loaded corpus stays cached before the next call reloads it. */
export const DEFAULT_GRAPH_CORPUS_TTL_MS = 5 * 60 * 1000;

/** Why the corpus could not load. */
export type GraphCorpusLoadError =
  | { readonly kind: 'not-found'; readonly message: string }
  | { readonly kind: 'read-failed'; readonly message: string }
  | { readonly kind: 'invalid-snapshot'; readonly message: string };

export type GraphCorpusLoadResult = Result<GraphCorpusSnapshot, GraphCorpusLoadError>;

export interface GraphCorpusLoaderOptions {
  readonly store: Pick<GraphCorpusSnapshotStore, 'readLatest'>;
  readonly ttlMs?: number;
  readonly now?: () => number;
  /** Called once per successful load with the snapshot's provenance. */
  readonly onLoad?: (provenance: {
    readonly downloadedAt: string;
    readonly generatedAt: string;
    readonly nodes: number;
    readonly edges: number;
  }) => void;
}

/**
 * Returns a function that loads the corpus on first use and caches it for
 * `ttlMs`. Concurrent calls share one read. A store or parse failure resolves
 * to a typed error and is not cached.
 */
export function createGraphCorpusLoader(
  options: GraphCorpusLoaderOptions,
): () => Promise<GraphCorpusLoadResult> {
  const ttlMs = options.ttlMs ?? DEFAULT_GRAPH_CORPUS_TTL_MS;
  const now = options.now ?? Date.now;
  let cached: { readonly snapshot: GraphCorpusSnapshot; readonly loadedAt: number } | undefined;
  let inFlight: Promise<GraphCorpusLoadResult> | undefined;

  async function read(): Promise<GraphCorpusLoadResult> {
    let text: string | null;
    try {
      text = await options.store.readLatest();
    } catch (error) {
      return err({
        kind: 'read-failed',
        message: error instanceof Error ? error.message : String(error),
      });
    }
    if (text === null) {
      return err({ kind: 'not-found', message: 'no graph corpus snapshot is stored' });
    }
    const parsed = parseGraphCorpusSnapshot(text);
    if (!isOk(parsed)) {
      return err({ kind: 'invalid-snapshot', message: parsed.error });
    }
    const snapshot = parsed.value;
    cached = { snapshot, loadedAt: now() };
    options.onLoad?.({
      downloadedAt: snapshot.downloadedAt,
      generatedAt: snapshot.generatedAt,
      nodes: snapshot.corpus.stats.totalNodes,
      edges: snapshot.corpus.stats.totalEdges,
    });
    return ok(snapshot);
  }

  return () => {
    if (cached !== undefined && now() - cached.loadedAt <= ttlMs) {
      return Promise.resolve(ok(cached.snapshot));
    }
    inFlight ??= read().finally(() => {
      inFlight = undefined;
    });
    return inFlight;
  };
}

/** A loader over the store {@link createObjectStoreFromEnv} picks. */
export function createGraphCorpusLoaderFromEnv(
  env: NodeJS.ProcessEnv,
  options: Omit<GraphCorpusLoaderOptions, 'store'> = {},
): () => Promise<GraphCorpusLoadResult> {
  return createGraphCorpusLoader({
    ...options,
    store: createGraphCorpusSnapshotStore(createObjectStoreFromEnv(env)),
  });
}

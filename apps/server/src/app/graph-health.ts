import { isOk } from '@oaknational/result';
import {
  createGraphCorpusSnapshotStore,
  createObjectStoreFromEnv,
  parseGraphCorpusSnapshot,
  type GraphCorpusSnapshotStore,
} from '@oaknational/graph-corpus-sdk/store';

import type { Env } from '../env.js';

export interface GraphHealth {
  readonly generatedAt: string | null;
  readonly stale: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const GRAPH_REFRESH_INTERVAL_MS = 7 * DAY_MS;
const GRAPH_REFRESH_GRACE_MS = DAY_MS;
export const GRAPH_STALE_AFTER_MS = GRAPH_REFRESH_INTERVAL_MS + GRAPH_REFRESH_GRACE_MS;

const GRAPH_HEALTH_TTL_MS = 5 * 60 * 1000;

export function createGraphHealthReader(deps: {
  readonly readLatest: () => Promise<string | null>;
  readonly onBecameStale: (health: GraphHealth) => void;
  readonly now?: () => number;
}): () => Promise<GraphHealth> {
  const now = deps.now ?? Date.now;
  let cached: { readonly health: GraphHealth; readonly readAt: number } | undefined;
  let inFlight: Promise<GraphHealth> | undefined;
  let wasStale = false;

  async function readGeneratedAt(): Promise<string | null> {
    try {
      const text = await deps.readLatest();
      const parsed = text === null ? null : parseGraphCorpusSnapshot(text);
      return parsed !== null && isOk(parsed) ? parsed.value.generatedAt : null;
    } catch {
      return null;
    }
  }

  async function read(): Promise<GraphHealth> {
    const generatedAt = await readGeneratedAt();
    const stale = generatedAt === null || now() - Date.parse(generatedAt) > GRAPH_STALE_AFTER_MS;
    const health = { generatedAt, stale };
    if (stale && !wasStale) {
      deps.onBecameStale(health);
    }
    wasStale = stale;
    cached = { health, readAt: now() };
    return health;
  }

  function reread(): Promise<GraphHealth> {
    inFlight ??= read().finally(() => {
      inFlight = undefined;
    });
    return inFlight;
  }

  return () => {
    if (cached === undefined) {
      return reread();
    }
    if (now() - cached.readAt > GRAPH_HEALTH_TTL_MS) {
      void reread();
    }
    return Promise.resolve(cached.health);
  };
}

export function createGraphSnapshotStoreFromEnv(
  env: Pick<Env, 'GRAPH_CORPUS_LOCAL_PATH' | 'BLOB_READ_WRITE_TOKEN'>,
): GraphCorpusSnapshotStore {
  return createGraphCorpusSnapshotStore(
    createObjectStoreFromEnv({
      GRAPH_CORPUS_LOCAL_PATH: env.GRAPH_CORPUS_LOCAL_PATH,
      BLOB_READ_WRITE_TOKEN: env.BLOB_READ_WRITE_TOKEN,
    }),
  );
}

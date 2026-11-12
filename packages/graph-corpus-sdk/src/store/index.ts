import { del, get, list, put } from '@vercel/blob';

import {
  createBlobObjectStore,
  createLocalFileObjectStore,
  type ObjectStore,
} from './object-store.js';

export {
  createBlobObjectStore,
  createLocalFileObjectStore,
  type BlobClient,
  type ObjectStore,
} from './object-store.js';
export {
  GRAPH_CORPUS_SCHEMA_VERSION,
  LATEST_KEY,
  RETAINED_DATED_COPIES,
  createGraphCorpusSnapshotStore,
  parseGraphCorpusSnapshot,
  type GraphCorpusSnapshot,
  type GraphCorpusSnapshotStore,
  type WrittenSnapshot,
} from './snapshot-store.js';
export {
  DEFAULT_MIN_RETENTION_RATIO,
  refreshGraphCorpus,
  type RefreshOutcome,
  type RefreshRefusal,
} from './refresh.js';

/** Real `@vercel/blob` Blob store, authenticated by `token` or the SDK's own `BLOB_READ_WRITE_TOKEN` lookup. */
export function createVercelBlobObjectStore(token?: string): ObjectStore {
  return createBlobObjectStore({ get, put, list, del }, token);
}

/**
 * Picks the object store from the environment: the local-file store rooted at
 * `GRAPH_CORPUS_LOCAL_PATH` when it is set, otherwise Vercel Blob.
 */
export function createObjectStoreFromEnv(env: NodeJS.ProcessEnv): ObjectStore {
  const localPath = env['GRAPH_CORPUS_LOCAL_PATH'];
  if (localPath !== undefined && localPath !== '') {
    return createLocalFileObjectStore(localPath);
  }
  return createVercelBlobObjectStore(env['BLOB_READ_WRITE_TOKEN']);
}

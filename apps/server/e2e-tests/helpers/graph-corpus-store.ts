import { fileURLToPath } from 'node:url';

import {
  GRAPH_CORPUS_SCHEMA_VERSION,
  createGraphCorpusSnapshotStore,
  createLocalFileObjectStore,
} from '@oaknational/graph-corpus-sdk/store';
import { graphCorpus } from '@oaknational/sdk-codegen/graph-corpus';

export const E2E_GRAPH_CORPUS_PATH = fileURLToPath(
  new URL('../../.cache/e2e-graph-corpus', import.meta.url),
);

export default async function seedGraphCorpusStore(): Promise<void> {
  const store = createGraphCorpusSnapshotStore(createLocalFileObjectStore(E2E_GRAPH_CORPUS_PATH));
  await store.write({
    schemaVersion: GRAPH_CORPUS_SCHEMA_VERSION,
    downloadedAt: graphCorpus.generatedAt,
    generatedAt: graphCorpus.generatedAt,
    corpus: graphCorpus,
  });
}

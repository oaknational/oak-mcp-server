import { fileURLToPath } from 'node:url';

import {
  GRAPH_CORPUS_SCHEMA_VERSION,
  createGraphCorpusSnapshotStore,
  createLocalFileObjectStore,
} from '@oaknational/graph-corpus-sdk/store';
import { fixtureCorpus } from '../../../../packages/graph-corpus-sdk/src/curriculum/__tests__/fixture-corpus.js';

export const E2E_GRAPH_CORPUS_PATH = fileURLToPath(
  new URL('../../.cache/e2e-graph-corpus', import.meta.url),
);

export default async function seedGraphCorpusStore(): Promise<void> {
  const store = createGraphCorpusSnapshotStore(createLocalFileObjectStore(E2E_GRAPH_CORPUS_PATH));
  await store.write({
    schemaVersion: GRAPH_CORPUS_SCHEMA_VERSION,
    downloadedAt: fixtureCorpus.generatedAt,
    generatedAt: fixtureCorpus.generatedAt,
    corpus: fixtureCorpus,
  });
}

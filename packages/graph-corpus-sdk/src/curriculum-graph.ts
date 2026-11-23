import type { GraphCorpus } from '@oaknational/sdk-codegen/graph-corpus';
import { isOk, ok, type Result } from '@oaknational/result';

import { createCurriculumGraphViews, type CurriculumGraphViews } from './curriculum/views.js';
import type { GraphCorpusLoadError, GraphCorpusLoadResult } from './load.js';
import { datedSnapshotKey } from './store/snapshot-store.js';

export type CurriculumGraphResult = Result<CurriculumGraphViews, GraphCorpusLoadError>;

/**
 * Returns a function that resolves the curriculum graph views over the
 * snapshot `load` returns. Caching, shared reads and uncached failures come
 * from `load` (see `createGraphCorpusLoader`). The views are cached per
 * corpus object, so a reload that returns the same snapshot reuses them and a
 * new snapshot gets fresh views.
 * Reports the dated key on each use, including cached reads.
 */
export function createCurriculumGraph(
  load: () => Promise<GraphCorpusLoadResult>,
  onSnapshotUsed?: (key: string) => void,
): () => Promise<CurriculumGraphResult> {
  const viewsByCorpus = new WeakMap<GraphCorpus, CurriculumGraphViews>();
  return async () => {
    const loaded = await load();
    if (!isOk(loaded)) {
      return loaded;
    }
    const { corpus } = loaded.value;
    let views = viewsByCorpus.get(corpus);
    if (views === undefined) {
      views = createCurriculumGraphViews(corpus);
      viewsByCorpus.set(corpus, views);
    }
    if (onSnapshotUsed !== undefined) {
      const downloadedAt = new Date(loaded.value.downloadedAt);
      if (Number.isFinite(downloadedAt.getTime())) {
        onSnapshotUsed(datedSnapshotKey(downloadedAt));
      }
    }
    return ok(views);
  };
}

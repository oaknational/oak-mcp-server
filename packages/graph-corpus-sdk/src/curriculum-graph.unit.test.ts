import { err, ok, unwrap } from '@oaknational/result';
import { describe, expect, it, vi } from 'vitest';

import { fixtureCorpus } from './curriculum/__tests__/fixture-corpus.js';
import { createCurriculumGraph } from './curriculum-graph.js';
import { createGraphCorpusLoader, type GraphCorpusLoadResult } from './load.js';
import { GRAPH_CORPUS_SCHEMA_VERSION, type GraphCorpusSnapshot } from './store/index.js';

function snapshotAt(downloadedAt: string): GraphCorpusSnapshot {
  return {
    schemaVersion: GRAPH_CORPUS_SCHEMA_VERSION,
    downloadedAt,
    generatedAt: downloadedAt,
    corpus: fixtureCorpus,
  };
}

function fakeStore(...reads: (() => Promise<string | null>)[]) {
  const readLatest = vi.fn<() => Promise<string | null>>();
  for (const read of reads) {
    readLatest.mockImplementationOnce(read);
  }
  return { readLatest };
}

const stored = (downloadedAt: string) => () =>
  Promise.resolve(JSON.stringify(snapshotAt(downloadedAt)));

describe('createCurriculumGraph', () => {
  it('resolves views over the loaded snapshot', async () => {
    const graph = createCurriculumGraph(
      createGraphCorpusLoader({ store: fakeStore(stored('2026-10-01T00:00:00.000Z')) }),
    );

    const views = unwrap(await graph());

    expect(views.priorKnowledgeStatements(['unit-b']).units).toHaveLength(1);
  });

  it('shares one read between concurrent calls and hands both the same views', async () => {
    const store = fakeStore(stored('2026-10-01T00:00:00.000Z'));
    const graph = createCurriculumGraph(createGraphCorpusLoader({ store }));

    const [first, second] = await Promise.all([graph(), graph()]);

    expect(store.readLatest).toHaveBeenCalledTimes(1);
    expect(unwrap(first)).toBe(unwrap(second));
  });

  it('reuses the views within the TTL and rebuilds them for the snapshot read after it', async () => {
    let clock = 0;
    const store = fakeStore(stored('2026-10-01T00:00:00.000Z'), stored('2026-10-02T00:00:00.000Z'));
    const graph = createCurriculumGraph(
      createGraphCorpusLoader({ store, ttlMs: 1000, now: () => clock }),
    );

    const first = unwrap(await graph());
    clock = 1000;
    expect(unwrap(await graph())).toBe(first);
    clock = 1001;
    const reloaded = unwrap(await graph());

    expect(store.readLatest).toHaveBeenCalledTimes(2);
    expect(reloaded).not.toBe(first);
  });

  it('reuses the views when a reload returns the same snapshot object', async () => {
    const snapshot = snapshotAt('2026-10-01T00:00:00.000Z');
    const graph = createCurriculumGraph(() => Promise.resolve(ok(snapshot)));

    expect(unwrap(await graph())).toBe(unwrap(await graph()));
  });

  it('does not cache a failure: the next call reads again', async () => {
    const store = fakeStore(
      () => Promise.reject(new Error('blob store unavailable')),
      stored('2026-10-01T00:00:00.000Z'),
    );
    const graph = createCurriculumGraph(createGraphCorpusLoader({ store }));

    expect(await graph()).toMatchObject({ ok: false, error: { kind: 'read-failed' } });
    expect(await graph()).toMatchObject({ ok: true });
    expect(store.readLatest).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['not-found', () => Promise.resolve(null)],
    ['invalid-snapshot', () => Promise.resolve('{"schemaVersion": 1}')],
  ] as const)('passes a %s load error through', async (kind, read) => {
    const graph = createCurriculumGraph(createGraphCorpusLoader({ store: fakeStore(read) }));

    expect(await graph()).toMatchObject({ ok: false, error: { kind } });
  });

  it('passes the load error value through unchanged', async () => {
    const failure: GraphCorpusLoadResult = err({ kind: 'not-found', message: 'nothing stored' });
    const graph = createCurriculumGraph(() => Promise.resolve(failure));

    expect(await graph()).toBe(failure);
  });
});

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { GraphCorpus } from '@oaknational/sdk-codegen/graph-corpus';
import { describe, expect, it, vi } from 'vitest';

import { createGraphCorpusLoader, createGraphCorpusLoaderFromEnv } from './load.js';
import { GRAPH_CORPUS_SCHEMA_VERSION, type GraphCorpusSnapshot } from './store/index.js';

function snapshotText(downloadedAt: string): string {
  const corpus = {
    stats: { totalNodes: 5, totalEdges: 4 },
    nodes: [],
    edges: [],
  } as unknown as GraphCorpus;
  const snapshot: GraphCorpusSnapshot = {
    schemaVersion: GRAPH_CORPUS_SCHEMA_VERSION,
    downloadedAt,
    generatedAt: '2026-11-01T00:00:00.000Z',
    corpus,
  };
  return JSON.stringify(snapshot);
}

function fakeStore(...reads: (() => Promise<string | null>)[]) {
  const readLatest = vi.fn<() => Promise<string | null>>();
  for (const read of reads) {
    readLatest.mockImplementationOnce(read);
  }
  return { readLatest };
}

describe('createGraphCorpusLoader', () => {
  it('loads on first use, caches within the TTL and reloads after it', async () => {
    let clock = 0;
    const store = fakeStore(
      () => Promise.resolve(snapshotText('2026-10-01T00:00:00.000Z')),
      () => Promise.resolve(snapshotText('2026-10-02T00:00:00.000Z')),
    );
    const onLoad = vi.fn();
    const load = createGraphCorpusLoader({ store, ttlMs: 1000, now: () => clock, onLoad });

    expect(store.readLatest).not.toHaveBeenCalled();
    expect(await load()).toMatchObject({
      ok: true,
      value: { downloadedAt: '2026-10-01T00:00:00.000Z' },
    });
    clock = 1000;
    expect(await load()).toMatchObject({
      ok: true,
      value: { downloadedAt: '2026-10-01T00:00:00.000Z' },
    });
    expect(store.readLatest).toHaveBeenCalledTimes(1);

    clock = 1001;
    expect(await load()).toMatchObject({
      ok: true,
      value: { downloadedAt: '2026-10-02T00:00:00.000Z' },
    });
    expect(store.readLatest).toHaveBeenCalledTimes(2);
    expect(onLoad).toHaveBeenLastCalledWith({
      downloadedAt: '2026-10-02T00:00:00.000Z',
      generatedAt: '2026-11-01T00:00:00.000Z',
      nodes: 5,
      edges: 4,
    });
  });

  it('shares one read between concurrent first calls', async () => {
    const store = fakeStore(() => Promise.resolve(snapshotText('2026-10-01T00:00:00.000Z')));
    const load = createGraphCorpusLoader({ store });
    const [first, second] = await Promise.all([load(), load()]);
    expect(first).toBe(second);
    expect(store.readLatest).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['not-found', () => Promise.resolve(null)],
    ['read-failed', () => Promise.reject(new Error('blob store unavailable'))],
    ['invalid-snapshot', () => Promise.resolve('{"schemaVersion":0}')],
  ] as const)('returns the typed %s error without throwing', async (kind, read) => {
    const load = createGraphCorpusLoader({ store: fakeStore(read) });
    expect(await load()).toMatchObject({ ok: false, error: { kind } });
  });

  it('retries after a failed load instead of caching the failure', async () => {
    const store = fakeStore(
      () => Promise.reject(new Error('blip')),
      () => Promise.resolve(snapshotText('2026-10-01T00:00:00.000Z')),
    );
    const load = createGraphCorpusLoader({ store });
    expect(await load()).toMatchObject({
      ok: false,
      error: { kind: 'read-failed', message: 'blip' },
    });
    expect(await load()).toMatchObject({ ok: true });
  });
});

describe('createGraphCorpusLoaderFromEnv', () => {
  it('returns not-found when GRAPH_CORPUS_LOCAL_PATH points at an empty location', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'graph-load-'));
    try {
      const load = createGraphCorpusLoaderFromEnv({
        GRAPH_CORPUS_LOCAL_PATH: path.join(dir, 'missing'),
      });
      expect(await load()).toMatchObject({ ok: false, error: { kind: 'not-found' } });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

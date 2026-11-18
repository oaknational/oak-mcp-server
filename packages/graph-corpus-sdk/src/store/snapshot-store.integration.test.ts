import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { isOk, unwrap } from '@oaknational/result';
import type { GraphCorpus } from '@oaknational/sdk-codegen/graph-corpus';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { fixtureCorpus } from '../curriculum/__tests__/fixture-corpus.js';
import { createFakeBlobClient } from './__tests__/fake-blob-client.js';
import {
  GRAPH_CORPUS_SCHEMA_VERSION,
  LATEST_KEY,
  RETAINED_DATED_COPIES,
  createBlobObjectStore,
  createGraphCorpusSnapshotStore,
  createLocalFileObjectStore,
  parseGraphCorpusSnapshot,
  type GraphCorpusSnapshot,
  type ObjectStore,
} from './index.js';

function snapshotAt(downloadedAt: string, totalNodes = 3): GraphCorpusSnapshot {
  const corpus = {
    version: '1.5.0',
    generatedAt: downloadedAt,
    sourceVersion: downloadedAt,
    stats: { totalNodes, totalEdges: 2 },
    nodes: [],
    edges: [],
    sequences: [],
    unitLessonRuns: [],
  } as unknown as GraphCorpus;
  return {
    schemaVersion: GRAPH_CORPUS_SCHEMA_VERSION,
    downloadedAt,
    generatedAt: downloadedAt,
    corpus,
  };
}

const day = (n: number): string => new Date(Date.UTC(2026, 9, n, 3)).toISOString();

const tempDirs: string[] = [];
afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const stores: readonly (readonly [string, () => Promise<ObjectStore>])[] = [
  [
    'local-file',
    async () => {
      const dir = await mkdtemp(path.join(tmpdir(), 'graph-store-'));
      tempDirs.push(dir);
      return createLocalFileObjectStore(dir);
    },
  ],
  ['fake Blob', () => Promise.resolve(createBlobObjectStore(createFakeBlobClient()))],
];

describe.each(stores)('graph corpus snapshot store over the %s store', (_name, makeStore) => {
  it('reads null before anything is written', async () => {
    const store = createGraphCorpusSnapshotStore(await makeStore());
    expect(await store.readLatest()).toBeNull();
  });

  it('writes latest.json and a dated copy that read back as the snapshot', async () => {
    const objects = await makeStore();
    const store = createGraphCorpusSnapshotStore(objects);
    const snapshot = snapshotAt('2026-09-03T11:18:46.637Z');

    const written = await store.write(snapshot);

    expect(written.latestKey).toBe(
      `graph-corpus/v${String(GRAPH_CORPUS_SCHEMA_VERSION)}/latest.json`,
    );
    expect(written.datedKey).toBe('graph-corpus/v1/2026-09-03T11-18-46-637Z.json');
    const latest = await store.readLatest();
    expect(latest).not.toBeNull();
    expect(unwrap(parseGraphCorpusSnapshot(latest ?? ''))).toEqual(snapshot);
    expect(await objects.get(written.datedKey)).toBe(latest);
  });

  it(`keeps the newest ${String(RETAINED_DATED_COPIES)} dated copies and latest.json equal to the newest`, async () => {
    const objects = await makeStore();
    const store = createGraphCorpusSnapshotStore(objects);
    for (let n = 1; n <= RETAINED_DATED_COPIES + 3; n += 1) {
      await store.write(snapshotAt(day(n)));
    }

    const keys = await objects.list('graph-corpus/v1/');
    const dated = keys.filter((key) => key !== LATEST_KEY).sort();
    expect(dated).toHaveLength(RETAINED_DATED_COPIES);
    expect(dated[0]).toContain('2026-10-04T03-00-00-000Z');
    const newest = dated.at(-1) ?? '';
    expect(await objects.get(LATEST_KEY)).toBe(await objects.get(newest));
    expect(unwrap(parseGraphCorpusSnapshot((await store.readLatest()) ?? '')).downloadedAt).toBe(
      day(RETAINED_DATED_COPIES + 3),
    );
  });

  it('writes when latest.json is still at the version it was read at', async () => {
    const store = createGraphCorpusSnapshotStore(await makeStore());
    await store.write(snapshotAt(day(1)));
    const read = await store.readLatestVersioned();

    const written = await store.writeIfLatestIs(read?.version ?? null, snapshotAt(day(2)));

    expect(written?.datedKey).toBe('graph-corpus/v1/2026-10-02T03-00-00-000Z.json');
    expect(unwrap(parseGraphCorpusSnapshot((await store.readLatest()) ?? '')).downloadedAt).toBe(
      day(2),
    );
  });

  it('writes nothing when latest.json changed since it was read', async () => {
    const objects = await makeStore();
    const store = createGraphCorpusSnapshotStore(objects);
    await store.write(snapshotAt(day(1)));
    const read = await store.readLatestVersioned();
    await store.write(snapshotAt(day(3)));
    const keysBefore = await objects.list('graph-corpus/v1/');

    expect(await store.writeIfLatestIs(read?.version ?? null, snapshotAt(day(2)))).toBeNull();
    expect(unwrap(parseGraphCorpusSnapshot((await store.readLatest()) ?? '')).downloadedAt).toBe(
      day(3),
    );
    expect(await objects.list('graph-corpus/v1/')).toEqual(keysBefore);
  });

  it('writes nothing when latest.json appeared after it was read as absent', async () => {
    const store = createGraphCorpusSnapshotStore(await makeStore());
    await store.write(snapshotAt(day(3)));

    expect(await store.writeIfLatestIs(null, snapshotAt(day(2)))).toBeNull();
    expect(unwrap(parseGraphCorpusSnapshot((await store.readLatest()) ?? '')).downloadedAt).toBe(
      day(3),
    );
  });

  it('leaves keys outside the dated pattern alone when pruning', async () => {
    const objects = await makeStore();
    await objects.put('graph-corpus/v1/notes.json', '{}');
    await objects.put('graph-corpus/v2/latest.json', '{}');
    const store = createGraphCorpusSnapshotStore(objects);
    for (let n = 1; n <= RETAINED_DATED_COPIES + 1; n += 1) {
      await store.write(snapshotAt(day(n)));
    }
    expect(await objects.get('graph-corpus/v1/notes.json')).toBe('{}');
    expect(await objects.get('graph-corpus/v2/latest.json')).toBe('{}');
  });
});

describe('conditional writes over the Blob store', () => {
  it('send ifMatch with the read ETag, or allowOverwrite false when latest.json was absent', async () => {
    const client = createFakeBlobClient();
    const store = createGraphCorpusSnapshotStore(createBlobObjectStore(client));
    await store.writeIfLatestIs(null, snapshotAt(day(1)));
    const read = await store.readLatestVersioned();
    await store.writeIfLatestIs(read?.version ?? null, snapshotAt(day(2)));

    const latestPuts = client.puts.filter((put) => put.pathname === LATEST_KEY);
    expect(latestPuts.map((put) => put.options)).toEqual([
      expect.objectContaining({ allowOverwrite: false }),
      expect.objectContaining({ allowOverwrite: true, ifMatch: read?.version }),
    ]);
    expect(latestPuts[0]?.options).not.toHaveProperty('ifMatch');
  });

  it('rethrows a failed write when latest.json is still at the expected version', async () => {
    const client = createFakeBlobClient();
    const store = createGraphCorpusSnapshotStore(
      createBlobObjectStore({
        ...client,
        put: () => Promise.reject(new Error('service unavailable')),
      }),
    );

    await expect(store.writeIfLatestIs(null, snapshotAt(day(1)))).rejects.toThrow(
      'service unavailable',
    );
  });
});

describe('readLatest', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('rejects when the object store read never settles', async () => {
    vi.useFakeTimers();
    const hung: ObjectStore = {
      get: () => new Promise<never>(() => undefined),
      getVersioned: () => new Promise<never>(() => undefined),
      put: () => Promise.resolve(),
      putIfVersion: () => Promise.resolve(true),
      list: () => Promise.resolve([]),
      delete: () => Promise.resolve(),
    };
    const store = createGraphCorpusSnapshotStore(hung, { readTimeoutMs: 50 });

    const read = expect(store.readLatest()).rejects.toThrow('timed out after 50 ms');
    await vi.advanceTimersByTimeAsync(50);

    await read;
  });
});

describe('parseGraphCorpusSnapshot', () => {
  it('keeps the source digest a snapshot records', () => {
    const text = JSON.stringify({ ...snapshotAt(day(1)), sourceDigest: 'sha256:abc' });
    expect(unwrap(parseGraphCorpusSnapshot(text)).sourceDigest).toBe('sha256:abc');
  });

  it.each([
    ['not JSON', '{', 'not JSON'],
    [
      'another schema version',
      JSON.stringify({ ...snapshotAt(day(1)), schemaVersion: 99 }),
      'schemaVersion 99',
    ],
    ['no provenance', JSON.stringify({ ...snapshotAt(day(1)), downloadedAt: 1 }), 'downloadedAt'],
    ['no corpus body', JSON.stringify({ ...snapshotAt(day(1)), corpus: { nodes: [] } }), 'corpus'],
  ])('refuses %s', (_name, text, message) => {
    const result = parseGraphCorpusSnapshot(text);
    expect(isOk(result)).toBe(false);
    expect(result).toMatchObject({ error: expect.stringContaining(message) as unknown });
  });
});

describe('parseGraphCorpusSnapshot corpus validation', () => {
  type Corpus = Record<string, unknown> & { nodes: unknown[]; edges: unknown[] };

  function editedSnapshot(edit: (corpus: Corpus) => void): string {
    const corpus = structuredClone(fixtureCorpus) as unknown as Corpus;
    edit(corpus);
    return JSON.stringify({ ...snapshotAt(day(1)), corpus });
  }

  const nodeWithId = (corpus: Corpus, id: string): Record<string, unknown> => {
    const node = corpus.nodes.find((candidate) => (candidate as { id: string }).id === id);
    if (node === undefined) {
      throw new Error(`fixture has no node ${id}`);
    }
    return node as Record<string, unknown>;
  };

  it('accepts a well-formed corpus and keeps it intact', () => {
    const result = parseGraphCorpusSnapshot(editedSnapshot(() => undefined));
    expect(unwrap(result).corpus).toEqual(fixtureCorpus);
  });

  it.each([
    [
      'an unknown node kind',
      (c: Corpus) => (nodeWithId(c, 'unit:unit-a')['kind'] = 'topic'),
      'kind',
    ],
    [
      'a node id without its kind qualifier',
      (c: Corpus) => (nodeWithId(c, 'unit:unit-a')['id'] = 'unit-a'),
      'unit-a',
    ],
    [
      'a node id qualified with another kind',
      (c: Corpus) => (nodeWithId(c, 'unit:unit-a')['id'] = 'lesson:unit-a'),
      'lesson:unit-a',
    ],
    [
      'a node missing a field its kind carries',
      (c: Corpus) => delete nodeWithId(c, 'lesson:lesson-a-1')['lessonTitle'],
      'lessonTitle',
    ],
    [
      'a unit whose prior knowledge is not a list of strings',
      (c: Corpus) => (nodeWithId(c, 'unit:unit-a')['priorKnowledge'] = 'Counts in tens.'),
      'priorKnowledge',
    ],
    [
      'an unknown edge type',
      (c: Corpus) =>
        c.edges.push({ source: 'unit:unit-a', type: 'teaches', target: 'unit:unit-b' }),
      'teaches',
    ],
    [
      'an edge to a node that does not exist',
      (c: Corpus) =>
        c.edges.push({ source: 'unit:unit-a', type: 'containsLesson', target: 'lesson:missing' }),
      'lesson:missing',
    ],
    [
      'an edge whose target is the wrong kind for its type',
      (c: Corpus) =>
        c.edges.push({ source: 'unit:unit-a', type: 'containsLesson', target: 'unit:unit-b' }),
      'containsLesson',
    ],
    [
      'an edge whose source is the wrong kind for its type',
      (c: Corpus) =>
        c.edges.push({
          source: 'unit:unit-a',
          type: 'addressesMisconception',
          target: c.nodes
            .map((node) => (node as { id: string }).id)
            .find((id) => id.startsWith('misconception:')),
        }),
      'addressesMisconception',
    ],
    [
      'a sequence placing a unit that does not exist',
      (c: Corpus) =>
        (c['sequences'] as { placements: unknown[] }[])[0]?.placements.push({
          unitId: 'unit:missing',
          year: 3,
        }),
      'unit:missing',
    ],
    [
      'a unit lesson run naming a lesson that does not exist',
      (c: Corpus) =>
        (c['unitLessonRuns'] as { lessonIds: unknown[] }[])[0]?.lessonIds.push('lesson:missing'),
      'lesson:missing',
    ],
    ['a corpus without sequences', (c: Corpus) => delete c['sequences'], 'sequences'],
    [
      'a corpus without unit lesson runs',
      (c: Corpus) => delete c['unitLessonRuns'],
      'unitLessonRuns',
    ],
  ])('refuses %s', (_name, edit, message) => {
    const result = parseGraphCorpusSnapshot(editedSnapshot(edit));
    expect(isOk(result)).toBe(false);
    expect(result).toMatchObject({ error: expect.stringContaining(message) as unknown });
  });
});

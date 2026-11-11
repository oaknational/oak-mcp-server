import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { isOk, unwrap } from '@oaknational/result';
import type { GraphCorpus } from '@oaknational/sdk-codegen/graph-corpus';
import { afterEach, describe, expect, it } from 'vitest';

import {
  GRAPH_CORPUS_SCHEMA_VERSION,
  LATEST_KEY,
  RETAINED_DATED_COPIES,
  createBlobObjectStore,
  createGraphCorpusSnapshotStore,
  createLocalFileObjectStore,
  parseGraphCorpusSnapshot,
  type BlobClient,
  type GraphCorpusSnapshot,
  type ObjectStore,
} from './index.js';

/** In-memory stand-in for `@vercel/blob`, paging `list` two blobs at a time. */
function createFakeBlobClient(): BlobClient & { readonly blobs: Map<string, string> } {
  const blobs = new Map<string, string>();
  return {
    blobs,
    get(pathname, options) {
      expect(options.access).toBe('private');
      const body = blobs.get(pathname);
      return Promise.resolve(body === undefined ? null : { stream: new Blob([body]).stream() });
    },
    put(pathname, body, options) {
      expect(options).toMatchObject({ access: 'private', addRandomSuffix: false });
      blobs.set(pathname, body);
      return Promise.resolve({ pathname });
    },
    list({ prefix, cursor }) {
      const all = [...blobs.keys()].filter((key) => key.startsWith(prefix)).sort();
      const start = cursor === undefined ? 0 : Number(cursor);
      const page = all.slice(start, start + 2).map((pathname) => ({ pathname }));
      const hasMore = start + 2 < all.length;
      return Promise.resolve({
        blobs: page,
        hasMore,
        ...(hasMore ? { cursor: String(start + 2) } : {}),
      });
    },
    del(pathnames) {
      for (const pathname of pathnames) {
        blobs.delete(pathname);
      }
      return Promise.resolve();
    },
  };
}

function snapshotAt(downloadedAt: string, totalNodes = 3): GraphCorpusSnapshot {
  const corpus = {
    version: '1.5.0',
    generatedAt: downloadedAt,
    sourceVersion: downloadedAt,
    stats: { totalNodes, totalEdges: 2 },
    nodes: [],
    edges: [],
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

describe('parseGraphCorpusSnapshot', () => {
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

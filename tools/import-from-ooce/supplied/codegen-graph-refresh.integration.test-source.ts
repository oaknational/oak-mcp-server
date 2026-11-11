import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { strToU8, zipSync } from 'fflate';
import { afterEach, describe, expect, it } from 'vitest';

import {
  LATEST_KEY,
  createGraphCorpusSnapshotStore,
  createLocalFileObjectStore,
  parseGraphCorpusSnapshot,
  type GraphCorpusSnapshotStore,
} from '../../../graph-corpus-sdk/src/store/index.js';
import { createLessonInput, createUnitInput } from '../../src/bulk/test-fixtures.js';
import {
  parseRetentionRatio,
  refreshGraphCorpus,
  resolveBulkFiles,
  type RefreshGuard,
} from './graph-refresh.js';

const DOWNLOADED_AT = '2026-09-03T11:18:46.637Z';

function bulkFile(lessonCount = 2): string {
  const lessons = Array.from({ length: lessonCount }, (_, i) =>
    createLessonInput({
      lessonSlug: `adding-${String(i)}`,
      lessonTitle: `Adding ${String(i)}`,
      unitSlug: 'adding',
      misconceptionsAndCommonMistakes: [
        { misconception: `Misconception ${String(i)}`, response: 'Model it with counters.' },
      ],
      lessonKeywords: [{ keyword: `term-${String(i)}`, description: 'A term.' }],
    }),
  );
  const unit = createUnitInput({
    unitSlug: 'adding',
    unitTitle: 'Adding',
    threads: [{ slug: 'number', order: 1, title: 'Number' }],
    unitLessons: lessons.map((lesson, i) => ({
      lessonSlug: lesson.lessonSlug,
      lessonTitle: lesson.lessonTitle,
      lessonOrder: i + 1,
      state: 'published',
    })),
  });
  return JSON.stringify({
    sequenceSlug: 'maths-primary',
    subjectTitle: 'Maths',
    sequence: [unit],
    lessons,
  });
}

const tempDirs: string[] = [];
afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'graph-refresh-'));
  tempDirs.push(dir);
  return dir;
}

async function bulkDir(
  files: Record<string, string>,
  downloadedAt = DOWNLOADED_AT,
): Promise<string> {
  const dir = await tempDir();
  await writeFile(path.join(dir, 'manifest.json'), JSON.stringify({ downloadedAt }));
  for (const [name, body] of Object.entries(files)) {
    await writeFile(path.join(dir, name), body);
  }
  return dir;
}

async function localStore(): Promise<GraphCorpusSnapshotStore> {
  return createGraphCorpusSnapshotStore(createLocalFileObjectStore(await tempDir()));
}

async function refreshFromDir(store: GraphCorpusSnapshotStore, dir: string, ratio = 0.5) {
  return refreshGraphCorpus({
    bulk: await resolveBulkFiles({ bulkDir: dir }),
    store,
    minRetentionRatio: ratio,
  });
}

describe('refreshGraphCorpus', () => {
  it('builds the corpus from a bulk directory and writes latest.json with its provenance', async () => {
    const store = await localStore();
    const result = await refreshFromDir(store, await bulkDir({ 'maths-primary.json': bulkFile() }));

    expect(result.ok).toBe(true);
    const summary = result.ok ? result.value : undefined;
    expect(summary).toMatchObject({ downloadedAt: DOWNLOADED_AT, latestKey: LATEST_KEY });
    expect(summary?.nodes).toBeGreaterThan(0);
    expect(summary?.edges).toBeGreaterThan(0);
    const stored = parseGraphCorpusSnapshot((await store.readLatest()) ?? '');
    expect(stored).toMatchObject({
      ok: true,
      value: {
        downloadedAt: DOWNLOADED_AT,
        generatedAt: summary?.generatedAt,
        corpus: { sourceVersion: DOWNLOADED_AT, stats: { totalNodes: summary?.nodes } },
      },
    });
  });

  it('fetches the bulk ZIP with the API key and builds from its entries', async () => {
    const zip = zipSync({ 'maths-primary.json': strToU8(bulkFile()) });
    let authorization: string | null = null;
    const fetchImpl: typeof fetch = (_url, init) => {
      authorization = new Headers(init?.headers).get('Authorization');
      return Promise.resolve(new Response(zip));
    };
    const store = await localStore();
    const result = await refreshGraphCorpus({
      bulk: await resolveBulkFiles({
        apiKey: 'test-key',
        fetchImpl,
        now: () => new Date(DOWNLOADED_AT),
      }),
      store,
      minRetentionRatio: 0.5,
    });
    expect(authorization).toBe('Bearer test-key');
    expect(result).toMatchObject({ ok: true, value: { downloadedAt: DOWNLOADED_AT } });
  });

  const refusals: readonly (readonly [
    RefreshGuard,
    string,
    () => ReturnType<typeof resolveBulkFiles>,
  ])[] = [
    ['missing-api-key', 'no OAK_API_KEY', () => resolveBulkFiles({})],
    [
      'fetch-failed',
      'an unreachable bulk URL',
      () =>
        resolveBulkFiles({
          apiKey: 'test-key',
          fetchImpl: () => Promise.reject(new TypeError('fetch failed')),
        }),
    ],
    [
      'fetch-failed',
      'an HTTP error',
      () =>
        resolveBulkFiles({
          apiKey: 'test-key',
          fetchImpl: () => Promise.resolve(new Response('denied', { status: 401 })),
        }),
    ],
    [
      'bulk-parse-failed',
      'a bulk file that fails the schema',
      async () =>
        resolveBulkFiles({
          bulkDir: await bulkDir({ 'maths-primary.json': '{"sequenceSlug":1}' }),
        }),
    ],
    [
      'bulk-parse-failed',
      'an unrecognised bulk file name',
      async () => resolveBulkFiles({ bulkDir: await bulkDir({ 'mathematics.json': bulkFile() }) }),
    ],
    [
      'empty-corpus',
      'a bulk download with no subject files',
      async () => resolveBulkFiles({ bulkDir: await bulkDir({}) }),
    ],
  ];

  it.each(refusals)(
    'refuses with %s for %s and leaves latest.json unchanged',
    async (guard, _case, makeBulk) => {
      const store = await localStore();
      await refreshFromDir(
        store,
        await bulkDir({ 'maths-primary.json': bulkFile() }, '2026-08-01T00:00:00.000Z'),
      );
      const before = await store.readLatest();

      const result = await refreshGraphCorpus({
        bulk: await makeBulk(),
        store,
        minRetentionRatio: 0.5,
      });

      expect(result).toMatchObject({ ok: false, error: { guard } });
      expect(await store.readLatest()).toBe(before);
    },
  );

  it('refuses with retention when the stored corpus is more than twice the new size', async () => {
    const store = await localStore();
    await refreshFromDir(
      store,
      await bulkDir({ 'maths-primary.json': bulkFile(10) }, '2026-08-01T00:00:00.000Z'),
    );
    const before = await store.readLatest();

    const result = await refreshFromDir(
      store,
      await bulkDir({ 'maths-primary.json': bulkFile(1) }),
    );

    expect(result).toMatchObject({ ok: false, error: { guard: 'retention' } });
    expect(await store.readLatest()).toBe(before);
  });

  it('writes over a stored snapshot it cannot read, as school-picker-service does', async () => {
    const objects = createLocalFileObjectStore(await tempDir());
    await objects.put(LATEST_KEY, 'not json');
    const lines: string[] = [];
    const result = await refreshGraphCorpus({
      bulk: await resolveBulkFiles({
        bulkDir: await bulkDir({ 'maths-primary.json': bulkFile() }),
      }),
      store: createGraphCorpusSnapshotStore(objects),
      minRetentionRatio: 0.5,
      log: (line) => lines.push(line),
    });
    expect(result.ok).toBe(true);
    expect(lines.join('\n')).toContain('treating it as absent');
  });
});

describe('parseRetentionRatio', () => {
  it('defaults to 0.5 and accepts 0 to 1', () => {
    expect(parseRetentionRatio(undefined)).toBe(0.5);
    expect(parseRetentionRatio('0')).toBe(0);
    expect(parseRetentionRatio('0.8')).toBe(0.8);
  });

  it.each(['-0.1', '1.5', 'half'])('rejects %s', (value) => {
    expect(() => parseRetentionRatio(value)).toThrow('GRAPH_MIN_RETENTION_RATIO');
  });
});

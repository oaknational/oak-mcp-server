import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import express, { type Express } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { err, ok } from '@oaknational/result';
import {
  createGraphCorpusSnapshotStore,
  createLocalFileObjectStore,
} from '@oaknational/graph-corpus-sdk/store';

import { request } from '../test-helpers/loopback-request.js';
import { createFakeLogger } from '../test-helpers/fakes.js';
import {
  REFRESH_GRAPH_PATH,
  createGraphRefresher,
  registerRefreshGraphRoute,
  type GraphRefresher,
} from './refresh-graph.js';

const SECRET = 'cron'.repeat(5);
const DOWNLOADED_AT = '2026-11-08T00:00:00.000Z';
const GENERATED_AT = '2026-11-08T00:05:00.000Z';
const DIGEST = 'sha256:abc';

function buildApp(refresher?: GraphRefresher) {
  const refresh = vi.fn<GraphRefresher>(
    refresher ??
      (() =>
        Promise.resolve(
          ok({
            status: 'refreshed',
            nodes: 3,
            edges: 2,
            downloadedAt: DOWNLOADED_AT,
            generatedAt: GENERATED_AT,
            sourceDigest: DIGEST,
            latestKey: 'graph-corpus/v1/latest.json',
            datedKey: 'graph-corpus/v1/2026-11-08T00-00-00-000Z.json',
            prunedKeys: [],
          } as const),
        )),
  );
  const captureHandledError = vi.fn();
  const app: Express = express();
  registerRefreshGraphRoute({
    app,
    secret: SECRET,
    refresher: refresh,
    observability: { captureHandledError },
    log: createFakeLogger(),
  });
  return { app, refresh, captureHandledError };
}

const tempDirs: string[] = [];
afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('GET /api/cron/refresh-graph', () => {
  it('returns 401 and refreshes nothing without a bearer', async () => {
    const { app, refresh } = buildApp();

    const res = await request(app).get(REFRESH_GRAPH_PATH);

    expect(res.status).toBe(401);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('returns 401 and refreshes nothing with a wrong bearer', async () => {
    const { app, refresh } = buildApp();

    const res = await request(app)
      .get(REFRESH_GRAPH_PATH)
      .set('Authorization', `Bearer ${SECRET.toUpperCase()}`);

    expect(res.status).toBe(401);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('refreshes and reports the new snapshot when the source changed', async () => {
    const { app, refresh } = buildApp();

    const res = await request(app).get(REFRESH_GRAPH_PATH).set('Authorization', `Bearer ${SECRET}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: 'refreshed',
      downloadedAt: DOWNLOADED_AT,
      generatedAt: GENERATED_AT,
      sourceDigest: DIGEST,
    });
    expect(refresh).toHaveBeenCalledOnce();
  });

  it('answers skipped when the source is unchanged', async () => {
    const { app } = buildApp(() =>
      Promise.resolve(ok({ status: 'skipped', sourceDigest: DIGEST } as const)),
    );

    const res = await request(app).get(REFRESH_GRAPH_PATH).set('Authorization', `Bearer ${SECRET}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'skipped', sourceDigest: DIGEST });
  });

  it('reports a refused refresh with 500 and sends it to Sentry', async () => {
    const { app, captureHandledError } = buildApp(() =>
      Promise.resolve(err({ guard: 'retention', message: 'too few nodes' } as const)),
    );

    const res = await request(app).get(REFRESH_GRAPH_PATH).set('Authorization', `Bearer ${SECRET}`);

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ status: 'refused', guard: 'retention' });
    expect(captureHandledError).toHaveBeenCalledOnce();
  });
});

describe('createGraphRefresher', () => {
  it('refuses with the fetch guard and writes nothing when the bulk download fails', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'cron-refresh-'));
    tempDirs.push(root);
    const objects = createLocalFileObjectStore(root);
    const refresh = createGraphRefresher({
      apiKey: 'test-key',
      store: createGraphCorpusSnapshotStore(objects),
      fetchImpl: () => Promise.resolve(new Response('denied', { status: 401 })),
    });

    const result = await refresh();

    expect(result).toMatchObject({ ok: false, error: { guard: 'fetch-failed' } });
    expect(await objects.list('graph-corpus/v1/')).toEqual([]);
  });
});

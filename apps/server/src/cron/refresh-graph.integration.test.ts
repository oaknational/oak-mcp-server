import express, { type Express } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { err, ok } from '@oaknational/result';

import { request } from '../test-helpers/loopback-request.js';
import { createFakeLogger } from '../test-helpers/fakes.js';
import {
  REFRESH_GRAPH_PATH,
  registerRefreshGraphRoute,
  type GraphRefresher,
} from './refresh-graph.js';

const SECRET = 'cron'.repeat(5);
const STORED = '2026-11-01T00:00:00.000Z';
const NEWER = '2026-11-08T00:00:00.000Z';

function buildApp(overrides: Partial<GraphRefresher> = {}) {
  const refresh = vi.fn<GraphRefresher['refresh']>(() =>
    Promise.resolve(ok({ downloadedAt: NEWER, generatedAt: '2026-11-08T00:05:00.000Z' })),
  );
  const refresher: GraphRefresher = {
    readBulkDownloadedAt: () => Promise.resolve(ok(NEWER)),
    readStoredDownloadedAt: () => Promise.resolve(STORED),
    refresh,
    ...overrides,
  };
  const captureHandledError = vi.fn();
  const app: Express = express();
  registerRefreshGraphRoute({
    app,
    secret: SECRET,
    refresher,
    observability: { captureHandledError },
    log: createFakeLogger(),
  });
  return { app, refresh: refresher.refresh, captureHandledError };
}

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

  it('refreshes when the bulk downloadedAt is newer than the stored one', async () => {
    const { app, refresh } = buildApp();

    const res = await request(app).get(REFRESH_GRAPH_PATH).set('Authorization', `Bearer ${SECRET}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: 'refreshed',
      downloadedAt: NEWER,
      generatedAt: '2026-11-08T00:05:00.000Z',
    });
    expect(refresh).toHaveBeenCalledOnce();
  });

  it('refreshes when nothing is stored yet', async () => {
    const { app, refresh } = buildApp({ readStoredDownloadedAt: () => Promise.resolve(null) });

    const res = await request(app).get(REFRESH_GRAPH_PATH).set('Authorization', `Bearer ${SECRET}`);

    expect(res.status).toBe(200);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it('refreshes when the stored downloadedAt does not parse', async () => {
    const { app, refresh } = buildApp({
      readStoredDownloadedAt: () => Promise.resolve('not-a-date'),
    });

    const res = await request(app).get(REFRESH_GRAPH_PATH).set('Authorization', `Bearer ${SECRET}`);

    expect(res.status).toBe(200);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it('skips when the bulk downloadedAt equals the stored one', async () => {
    const { app, refresh } = buildApp({ readBulkDownloadedAt: () => Promise.resolve(ok(STORED)) });

    const res = await request(app).get(REFRESH_GRAPH_PATH).set('Authorization', `Bearer ${SECRET}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: 'skipped',
      downloadedAt: STORED,
      storedDownloadedAt: STORED,
    });
    expect(refresh).not.toHaveBeenCalled();
  });

  it('reports a refused refresh with 500 and sends it to Sentry', async () => {
    const { app, captureHandledError } = buildApp({
      refresh: () => Promise.resolve(err({ guard: 'retention', message: 'too few nodes' })),
    });

    const res = await request(app).get(REFRESH_GRAPH_PATH).set('Authorization', `Bearer ${SECRET}`);

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ status: 'refused', guard: 'retention' });
    expect(captureHandledError).toHaveBeenCalledOnce();
  });

  it('answers 503 after auth when no refresher is wired', async () => {
    const app = express();
    registerRefreshGraphRoute({
      app,
      secret: SECRET,
      refresher: undefined,
      observability: { captureHandledError: vi.fn() },
      log: createFakeLogger(),
    });

    const unauthorised = await request(app).get(REFRESH_GRAPH_PATH);
    const authorised = await request(app)
      .get(REFRESH_GRAPH_PATH)
      .set('Authorization', `Bearer ${SECRET}`);

    expect(unauthorised.status).toBe(401);
    expect(authorised.status).toBe(503);
  });

  it('reports an unreadable bulk manifest with 502 and refreshes nothing', async () => {
    const { app, refresh, captureHandledError } = buildApp({
      readBulkDownloadedAt: () => Promise.resolve(err('manifest unreachable')),
    });

    const res = await request(app).get(REFRESH_GRAPH_PATH).set('Authorization', `Bearer ${SECRET}`);

    expect(res.status).toBe(502);
    expect(res.body).toEqual({ status: 'manifest-unavailable' });
    expect(refresh).not.toHaveBeenCalled();
    expect(captureHandledError).toHaveBeenCalledOnce();
  });
});

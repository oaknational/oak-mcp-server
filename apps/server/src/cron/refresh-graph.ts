import { timingSafeEqual } from 'node:crypto';

import type { Express, Request, Response } from 'express';
import type { Logger } from '@oaknational/logger';
import { isOk, type Result } from '@oaknational/result';

import type { HttpObservability } from '../observability/http-observability.js';

export const REFRESH_GRAPH_PATH = '/api/cron/refresh-graph';

export interface GraphRefreshRefusal {
  readonly guard: string;
  readonly message: string;
}

export interface GraphRefresher {
  readBulkDownloadedAt(): Promise<Result<string, string>>;
  readStoredDownloadedAt(): Promise<string | null>;
  refresh(): Promise<
    Result<{ readonly downloadedAt: string; readonly generatedAt: string }, GraphRefreshRefusal>
  >;
}

interface RegisterRefreshGraphRouteDeps {
  readonly app: Express;
  readonly secret: string;
  readonly refresher: GraphRefresher | undefined;
  readonly observability: Pick<HttpObservability, 'captureHandledError'>;
  readonly log: Logger;
}

function hasBearer(req: Request, secret: string): boolean {
  const expected = Buffer.from(`Bearer ${secret}`, 'utf8');
  const provided = Buffer.from(req.header('authorization') ?? '', 'utf8');
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

function isNewer(candidate: string, stored: string | null): boolean {
  return stored === null || Date.parse(candidate) > Date.parse(stored);
}

async function runRefresh(
  refresher: GraphRefresher,
  res: Response,
  deps: Pick<RegisterRefreshGraphRouteDeps, 'observability' | 'log'>,
): Promise<void> {
  const bulk = await refresher.readBulkDownloadedAt();
  if (!isOk(bulk)) {
    deps.observability.captureHandledError(new Error(`graph refresh: ${bulk.error}`), {
      boundary: 'cron_refresh_graph',
    });
    res.status(502).json({ status: 'manifest-unavailable' });
    return;
  }
  const stored = await refresher.readStoredDownloadedAt();
  if (!isNewer(bulk.value, stored)) {
    deps.log.info('cron.refresh-graph.skipped', { downloadedAt: bulk.value });
    res
      .status(200)
      .json({ status: 'skipped', downloadedAt: bulk.value, storedDownloadedAt: stored });
    return;
  }
  const result = await refresher.refresh();
  if (!isOk(result)) {
    deps.observability.captureHandledError(
      new Error(`graph refresh refused (${result.error.guard}): ${result.error.message}`),
      { boundary: 'cron_refresh_graph', guard: result.error.guard },
    );
    res.status(500).json({ status: 'refused', guard: result.error.guard });
    return;
  }
  deps.log.info('cron.refresh-graph.refreshed', { ...result.value });
  res.status(200).json({ status: 'refreshed', ...result.value });
}

export function registerRefreshGraphRoute(deps: RegisterRefreshGraphRouteDeps): void {
  const { app, secret, refresher, log } = deps;
  app.get(REFRESH_GRAPH_PATH, async (req, res) => {
    if (!hasBearer(req, secret)) {
      log.warn('cron.refresh-graph.auth.failed', {
        hasHeader: req.header('authorization') !== undefined,
      });
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    if (refresher === undefined) {
      res.status(503).json({ status: 'not-configured' });
      return;
    }
    await runRefresh(refresher, res, deps);
  });
}

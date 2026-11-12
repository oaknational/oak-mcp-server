import { timingSafeEqual } from 'node:crypto';

import type { Express, Request, Response } from 'express';
import type { Logger } from '@oaknational/logger';
import { isOk, type Result } from '@oaknational/result';
import {
  refreshGraphCorpus,
  type GraphCorpusSnapshotStore,
  type RefreshOutcome,
  type RefreshRefusal,
} from '@oaknational/graph-corpus-sdk/store';
import { resolveBulkFiles } from '@oaknational/sdk-codegen/graph-refresh';

import type { HttpObservability } from '../observability/http-observability.js';

export const REFRESH_GRAPH_PATH = '/api/cron/refresh-graph';

export type GraphRefresher = () => Promise<Result<RefreshOutcome, RefreshRefusal>>;

/** The production refresher: fetch the bulk download, then refresh the stored snapshot. */
export function createGraphRefresher(deps: {
  readonly apiKey: string;
  readonly store: GraphCorpusSnapshotStore;
  readonly fetchImpl?: typeof fetch;
}): GraphRefresher {
  return async () =>
    refreshGraphCorpus({
      bulk: await resolveBulkFiles({
        apiKey: deps.apiKey,
        ...(deps.fetchImpl === undefined ? {} : { fetchImpl: deps.fetchImpl }),
      }),
      store: deps.store,
    });
}

interface RegisterRefreshGraphRouteDeps {
  readonly app: Express;
  readonly secret: string;
  readonly refresher: GraphRefresher;
  readonly observability: Pick<HttpObservability, 'captureHandledError'>;
  readonly log: Logger;
}

function hasBearer(req: Request, secret: string): boolean {
  const expected = Buffer.from(`Bearer ${secret}`, 'utf8');
  const provided = Buffer.from(req.header('authorization') ?? '', 'utf8');
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

async function runRefresh(
  refresher: GraphRefresher,
  res: Response,
  deps: Pick<RegisterRefreshGraphRouteDeps, 'observability' | 'log'>,
): Promise<void> {
  const result = await refresher();
  if (!isOk(result)) {
    deps.observability.captureHandledError(
      new Error(`graph refresh refused (${result.error.guard}): ${result.error.message}`),
      { boundary: 'cron_refresh_graph', guard: result.error.guard },
    );
    res.status(500).json({ status: 'refused', guard: result.error.guard });
    return;
  }
  const outcome = result.value;
  if (outcome.status === 'skipped') {
    deps.log.info('cron.refresh-graph.skipped', { sourceDigest: outcome.sourceDigest });
    res.status(200).json(outcome);
    return;
  }
  const summary = {
    downloadedAt: outcome.downloadedAt,
    generatedAt: outcome.generatedAt,
    sourceDigest: outcome.sourceDigest,
  };
  deps.log.info('cron.refresh-graph.refreshed', summary);
  res.status(200).json({ status: 'refreshed', ...summary });
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
    await runRefresh(refresher, res, deps);
  });
}

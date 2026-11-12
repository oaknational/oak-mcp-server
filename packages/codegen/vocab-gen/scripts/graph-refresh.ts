import { resolveEnv } from '@oaknational/env/resolution';
import { z } from 'zod';

import { DEFAULT_MIN_RETENTION_RATIO } from '../../../graph-corpus-sdk/src/store/index.js';

const graphRefreshEnvSchema = z.object({
  OAK_API_KEY: z.string().optional(),
  OAK_BULK_URL: z.string().optional(),
  GRAPH_CORPUS_LOCAL_PATH: z.string().optional(),
  GRAPH_MIN_RETENTION_RATIO: z.string().optional(),
  BLOB_READ_WRITE_TOKEN: z.string().optional(),
});

export type GraphRefreshEnv = z.infer<typeof graphRefreshEnvSchema>;

/**
 * Reads repo-root `.env` and `.env.local`, then the process environment, as
 * the server does. Every key is optional so a missing `OAK_API_KEY` reaches
 * the `missing-api-key` guard.
 */
export function resolveGraphRefreshEnv(
  processEnv: Readonly<Record<string, string | undefined>>,
  startDir: string,
): GraphRefreshEnv {
  const result = resolveEnv({ schema: graphRefreshEnvSchema, processEnv, startDir });
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.value;
}

export function parseRetentionRatio(value: string | undefined): number {
  if (value === undefined || value === '') {
    return DEFAULT_MIN_RETENTION_RATIO;
  }
  const ratio = Number(value);
  if (!Number.isFinite(ratio) || ratio < 0 || ratio > 1) {
    throw new Error(`GRAPH_MIN_RETENTION_RATIO must be a number from 0 to 1, got "${value}"`);
  }
  return ratio;
}

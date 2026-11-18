import path from 'node:path';
import { parseArgs } from 'node:util';

import { isOk } from '@oaknational/result';

import {
  LATEST_KEY,
  breakStaleLocalLock,
  createGraphCorpusSnapshotStore,
  createLocalFileObjectStore,
  createVercelBlobObjectStore,
  refreshGraphCorpus,
} from '../../../graph-corpus-sdk/src/store/index.js';
import { resolveBulkFiles } from '../../src/graph-refresh.js';
import { parseRetentionRatio, resolveGraphRefreshEnv } from './graph-refresh.js';

const repoRoot = path.resolve(import.meta.dirname, '../../../..');

const { values } = parseArgs({
  options: {
    store: { type: 'string', default: 'local' },
    'bulk-dir': { type: 'string' },
    'allow-rollback': { type: 'boolean', default: false },
    'break-stale-lock': { type: 'boolean', default: false },
  },
});

if (values.store !== 'local' && values.store !== 'blob') {
  process.stderr.write(`--store must be local or blob, got "${values.store}"\n`);
  process.exit(2);
}

const env = resolveGraphRefreshEnv(process.env, import.meta.dirname);
const localRoot = env.GRAPH_CORPUS_LOCAL_PATH || path.join(repoRoot, '.cache', 'graph-corpus');

if (values['break-stale-lock']) {
  if (values.store !== 'local') {
    process.stderr.write('--break-stale-lock works only with --store local\n');
    process.exit(2);
  }
  const broken = await breakStaleLocalLock(localRoot, LATEST_KEY);
  if (!isOk(broken)) {
    process.stderr.write(`graph:refresh left the lock in place: ${broken.error}\n`);
    process.exit(1);
  }
  process.stdout.write(`graph:refresh ${broken.value}\n`);
  process.exit(0);
}

const objects =
  values.store === 'local'
    ? createLocalFileObjectStore(localRoot)
    : createVercelBlobObjectStore(env.BLOB_READ_WRITE_TOKEN);
const bulkDir = values['bulk-dir'];
const apiKey = env.OAK_API_KEY;
const url = env.OAK_BULK_URL;

const result = await refreshGraphCorpus({
  bulk: await resolveBulkFiles({
    ...(bulkDir === undefined ? {} : { bulkDir: path.resolve(bulkDir) }),
    ...(apiKey === undefined ? {} : { apiKey }),
    ...(url === undefined || url === '' ? {} : { url }),
  }),
  store: createGraphCorpusSnapshotStore(objects),
  minRetentionRatio: parseRetentionRatio(env.GRAPH_MIN_RETENTION_RATIO),
  allowRollback: values['allow-rollback'],
  log: (line) => process.stderr.write(`graph:refresh: ${line}\n`),
});

if (!isOk(result)) {
  process.stderr.write(
    `graph:refresh refused (${result.error.guard}): ${result.error.message}. latest.json is unchanged.\n`,
  );
  process.exit(1);
}

const summary = result.value;
if (summary.status === 'skipped') {
  process.stdout.write(
    `graph:refresh skipped: the stored snapshot was built from the same data (${summary.sourceDigest})\n`,
  );
  process.exit(0);
}
const where = values.store === 'local' ? `${localRoot}/` : 'blob:';
process.stdout.write(
  [
    `graph:refresh wrote ${where}${summary.latestKey} and ${summary.datedKey}`,
    `  nodes: ${String(summary.nodes)}`,
    `  edges: ${String(summary.edges)}`,
    `  downloadedAt: ${summary.downloadedAt}`,
    `  generatedAt: ${summary.generatedAt}`,
    `  pruned: ${summary.prunedKeys.length === 0 ? 'none' : summary.prunedKeys.join(', ')}`,
    '',
  ].join('\n'),
);

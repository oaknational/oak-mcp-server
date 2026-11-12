import path from 'node:path';
import { parseArgs } from 'node:util';

import { isOk } from '@oaknational/result';

import {
  createGraphCorpusSnapshotStore,
  createLocalFileObjectStore,
  createVercelBlobObjectStore,
} from '../../../graph-corpus-sdk/src/store/index.js';
import {
  parseRetentionRatio,
  refreshGraphCorpus,
  resolveBulkFiles,
  resolveGraphRefreshEnv,
} from './graph-refresh.js';

const repoRoot = path.resolve(import.meta.dirname, '../../../..');

const { values } = parseArgs({
  options: {
    store: { type: 'string', default: 'local' },
    'bulk-dir': { type: 'string' },
  },
});

if (values.store !== 'local' && values.store !== 'blob') {
  process.stderr.write(`--store must be local or blob, got "${values.store}"\n`);
  process.exit(2);
}

const env = resolveGraphRefreshEnv(process.env, import.meta.dirname);
const localRoot = env.GRAPH_CORPUS_LOCAL_PATH || path.join(repoRoot, '.cache', 'graph-corpus');
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
  log: (line) => process.stderr.write(`graph:refresh: ${line}\n`),
});

if (!isOk(result)) {
  process.stderr.write(
    `graph:refresh refused (${result.error.guard}): ${result.error.message}. latest.json is unchanged.\n`,
  );
  process.exit(1);
}

const summary = result.value;
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

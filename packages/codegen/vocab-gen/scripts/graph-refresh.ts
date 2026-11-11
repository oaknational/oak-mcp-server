import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { err, isOk, ok, type Result } from '@oaknational/result';
import { strFromU8, unzipSync } from 'fflate';

import {
  GRAPH_CORPUS_SCHEMA_VERSION,
  parseGraphCorpusSnapshot,
  type GraphCorpusSnapshotStore,
} from '../../../graph-corpus-sdk/src/store/index.js';
import { generateGraphCorpusData, type GraphCorpus } from '../../src/bulk.js';
import { checkBulkFileSet } from '../../src/bulk/reader-utils.js';
import { bulkDownloadFileSchema, extractSubjectPhase } from '../lib/index.js';
import { processBulkData, type BulkDataInput } from '../vocab-gen-core.js';
import { toBulkDataInputs } from '../vocab-gen-inputs.js';

export const DEFAULT_BULK_URL = 'https://open-api.thenational.academy/api/bulk';
export const DEFAULT_MIN_RETENTION_RATIO = 0.5;

const BULK_SUBJECTS = [
  'art-primary',
  'art-secondary',
  'citizenship-secondary',
  'computing-primary',
  'computing-secondary',
  'cooking-nutrition-primary',
  'cooking-nutrition-secondary',
  'design-technology-primary',
  'design-technology-secondary',
  'english-primary',
  'english-secondary',
  'french-primary',
  'french-secondary',
  'geography-primary',
  'geography-secondary',
  'german-secondary',
  'history-primary',
  'history-secondary',
  'maths-primary',
  'maths-secondary',
  'music-primary',
  'music-secondary',
  'physical-education-primary',
  'physical-education-secondary',
  'religious-education-primary',
  'religious-education-secondary',
  'rshe-pshe-primary',
  'rshe-pshe-secondary',
  'science-primary',
  'science-secondary',
  'spanish-primary',
  'spanish-secondary',
] as const;

export type RefreshGuard =
  'missing-api-key' | 'fetch-failed' | 'bulk-parse-failed' | 'empty-corpus' | 'retention';

export interface RefreshRefusal {
  readonly guard: RefreshGuard;
  readonly message: string;
}

export interface BulkFiles {
  readonly downloadedAt: string;
  readonly names: readonly string[];
  read(name: string): Promise<string>;
}

const refuse = (guard: RefreshGuard, message: string): Result<never, RefreshRefusal> =>
  err({ guard, message });

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export async function fetchBulkFiles(options: {
  readonly url: string;
  readonly apiKey: string;
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => Date;
}): Promise<Result<BulkFiles, RefreshRefusal>> {
  const fetchImpl = options.fetchImpl ?? fetch;
  let zip: Uint8Array;
  try {
    const response = await fetchImpl(options.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${options.apiKey}` },
      body: JSON.stringify({ subjects: BULK_SUBJECTS }),
    });
    if (!response.ok) {
      return refuse('fetch-failed', `bulk download returned HTTP ${String(response.status)}`);
    }
    zip = new Uint8Array(await response.arrayBuffer());
  } catch (error) {
    return refuse('fetch-failed', `bulk download failed: ${messageOf(error)}`);
  }
  const downloadedAt = (options.now?.() ?? new Date()).toISOString();
  const names: string[] = [];
  try {
    unzipSync(zip, {
      filter: (entry) => {
        names.push(entry.name);
        return false;
      },
    });
  } catch (error) {
    return refuse('bulk-parse-failed', `bulk download is not a ZIP: ${messageOf(error)}`);
  }
  return ok({
    downloadedAt,
    names,
    read: (name) => {
      const entry = unzipSync(zip, { filter: (candidate) => candidate.name === name })[name];
      return entry === undefined
        ? Promise.reject(new Error(`${name} is not in the bulk ZIP`))
        : Promise.resolve(strFromU8(entry));
    },
  });
}

export async function readBulkDirectory(dir: string): Promise<Result<BulkFiles, RefreshRefusal>> {
  let downloadedAt: unknown;
  let names: string[];
  try {
    const manifest: unknown = JSON.parse(await readFile(path.join(dir, 'manifest.json'), 'utf8'));
    downloadedAt =
      typeof manifest === 'object' && manifest !== null && 'downloadedAt' in manifest
        ? manifest.downloadedAt
        : undefined;
    names = (await readdir(dir)).filter((name) => name.endsWith('.json'));
  } catch (error) {
    return refuse('bulk-parse-failed', `cannot read bulk directory ${dir}: ${messageOf(error)}`);
  }
  if (typeof downloadedAt !== 'string' || Number.isNaN(Date.parse(downloadedAt))) {
    return refuse('bulk-parse-failed', `${dir}/manifest.json has no ISO downloadedAt`);
  }
  return ok({ downloadedAt, names, read: (name) => readFile(path.join(dir, name), 'utf8') });
}

export function resolveBulkFiles(options: {
  readonly bulkDir?: string;
  readonly apiKey?: string;
  readonly url?: string;
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => Date;
}): Promise<Result<BulkFiles, RefreshRefusal>> {
  if (options.bulkDir !== undefined) {
    return readBulkDirectory(options.bulkDir);
  }
  if (options.apiKey === undefined || options.apiKey === '') {
    return Promise.resolve(refuse('missing-api-key', 'OAK_API_KEY is not set'));
  }
  return fetchBulkFiles({
    url: options.url ?? DEFAULT_BULK_URL,
    apiKey: options.apiKey,
    ...(options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
    ...(options.now === undefined ? {} : { now: options.now }),
  });
}

export async function buildGraphCorpus(
  bulk: BulkFiles,
): Promise<Result<GraphCorpus, RefreshRefusal>> {
  const names = [...bulk.names].sort();
  const nameCheck = checkBulkFileSet(
    names.map((filename) => ({ filename, sequenceSlug: undefined })),
  );
  if (!isOk(nameCheck)) {
    return refuse('bulk-parse-failed', nameCheck.error.message);
  }
  const inputs: BulkDataInput[] = [];
  const parsedFiles: { filename: string; sequenceSlug: string }[] = [];
  for (const filename of names) {
    const subjectPhase = extractSubjectPhase(filename);
    if (subjectPhase === undefined) {
      continue;
    }
    let data;
    try {
      data = bulkDownloadFileSchema.parse(JSON.parse(await bulk.read(filename)));
    } catch (error) {
      return refuse('bulk-parse-failed', `${filename}: ${messageOf(error)}`);
    }
    parsedFiles.push({ filename, sequenceSlug: data.sequenceSlug });
    inputs.push(...toBulkDataInputs([{ filename, subjectPhase, data }]).inputs);
  }
  const setCheck = checkBulkFileSet(parsedFiles);
  if (!isOk(setCheck)) {
    return refuse('bulk-parse-failed', setCheck.error.message);
  }
  const { extractedData } = processBulkData(inputs);
  return ok(
    generateGraphCorpusData({
      priorKnowledge: extractedData.priorKnowledge,
      threads: extractedData.threads,
      lessons: extractedData.lessons,
      unitLessons: extractedData.unitLessons,
      misconceptions: extractedData.misconceptions,
      keywords: extractedData.keywords,
      sourceVersion: bulk.downloadedAt,
    }),
  );
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

export interface RefreshSummary {
  readonly nodes: number;
  readonly edges: number;
  readonly downloadedAt: string;
  readonly generatedAt: string;
  readonly latestKey: string;
  readonly datedKey: string;
  readonly prunedKeys: readonly string[];
}

async function readStoredCounts(
  store: GraphCorpusSnapshotStore,
  log: (line: string) => void,
): Promise<{ nodes: number; edges: number } | null> {
  try {
    const text = await store.readLatest();
    if (text === null) {
      return null;
    }
    const parsed = parseGraphCorpusSnapshot(text);
    if (!isOk(parsed)) {
      log(`stored snapshot is unreadable, treating it as absent: ${parsed.error}`);
      return null;
    }
    return {
      nodes: parsed.value.corpus.stats.totalNodes,
      edges: parsed.value.corpus.stats.totalEdges,
    };
  } catch (error) {
    log(`stored snapshot is unreadable, treating it as absent: ${messageOf(error)}`);
    return null;
  }
}

export async function refreshGraphCorpus(options: {
  readonly bulk: Result<BulkFiles, RefreshRefusal>;
  readonly store: GraphCorpusSnapshotStore;
  readonly minRetentionRatio: number;
  readonly log?: (line: string) => void;
}): Promise<Result<RefreshSummary, RefreshRefusal>> {
  const log = options.log ?? (() => undefined);
  if (!isOk(options.bulk)) {
    return options.bulk;
  }
  const bulk = options.bulk.value;
  const built = await buildGraphCorpus(bulk);
  if (!isOk(built)) {
    return built;
  }
  const corpus = built.value;
  const nodes = corpus.stats.totalNodes;
  const edges = corpus.stats.totalEdges;
  if (nodes === 0) {
    return refuse('empty-corpus', 'the new corpus has no nodes');
  }
  const stored = await readStoredCounts(options.store, log);
  const ratio = options.minRetentionRatio;
  if (stored !== null && (nodes < stored.nodes * ratio || edges < stored.edges * ratio)) {
    return refuse(
      'retention',
      `new corpus has ${String(nodes)} nodes and ${String(edges)} edges, below ${String(ratio)} of the stored ` +
        `${String(stored.nodes)} nodes and ${String(stored.edges)} edges`,
    );
  }
  const written = await options.store.write({
    schemaVersion: GRAPH_CORPUS_SCHEMA_VERSION,
    downloadedAt: bulk.downloadedAt,
    generatedAt: corpus.generatedAt,
    corpus,
  });
  return ok({
    nodes,
    edges,
    downloadedAt: bulk.downloadedAt,
    generatedAt: corpus.generatedAt,
    ...written,
  });
}

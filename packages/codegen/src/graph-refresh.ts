import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { err, isOk, ok, type Result } from '@oaknational/result';
import { strFromU8, unzipSync } from 'fflate';

import { checkBulkFileSet, extractSubjectPhase } from './bulk/reader-utils.js';
import { excludeRestrictedLessons } from './bulk/restricted-lesson-filter.js';
import {
  extractKeywords,
  extractLessons,
  extractMisconceptions,
  extractPriorKnowledge,
  extractThreads,
  extractUnitLessons,
} from './bulk/extractors/index.js';
import { generateGraphCorpusData } from './bulk/generators/index.js';
import type { BulkFileResult } from './bulk/reader.js';
import { bulkDownloadFileSchema } from './types/generated/bulk/index.js';
import type { GraphCorpus } from './graph-corpus.js';

export const DEFAULT_BULK_URL = 'https://open-api.thenational.academy/api/bulk';

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
  readonly fetchedAt: string;
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
  const fetchedAt = (options.now?.() ?? new Date()).toISOString();
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
    fetchedAt,
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
  return ok({
    fetchedAt: downloadedAt,
    names,
    read: (name) => readFile(path.join(dir, name), 'utf8'),
  });
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

const dataFileNames = (bulk: BulkFiles): readonly string[] =>
  bulk.names.filter((name) => extractSubjectPhase(name) !== undefined).sort();

/**
 * The bulk download carries no date of its own, so this digest is how a
 * refresh tells an unchanged source from a changed one.
 */
export async function digestBulkFiles(bulk: BulkFiles): Promise<string> {
  const hash = createHash('sha256');
  for (const name of dataFileNames(bulk)) {
    hash
      .update(name)
      .update('\0')
      .update(await bulk.read(name))
      .update('\0');
  }
  return `sha256:${hash.digest('hex')}`;
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
  const files: BulkFileResult[] = [];
  for (const filename of names) {
    const subjectPhase = extractSubjectPhase(filename);
    if (subjectPhase === undefined) {
      continue;
    }
    try {
      const data = bulkDownloadFileSchema.parse(JSON.parse(await bulk.read(filename)));
      files.push({ filename, subjectPhase, data });
    } catch (error) {
      return refuse('bulk-parse-failed', `${filename}: ${messageOf(error)}`);
    }
  }
  const setCheck = checkBulkFileSet(
    files.map(({ filename, data }) => ({ filename, sequenceSlug: data.sequenceSlug })),
  );
  if (!isOk(setCheck)) {
    return refuse('bulk-parse-failed', setCheck.error.message);
  }
  const kept = excludeRestrictedLessons(files).files;
  const lessons = kept.flatMap((file) => file.data.lessons);
  const units = kept.flatMap((file) =>
    file.data.sequence.map((unit) => ({ unit, sequenceSlug: file.data.sequenceSlug })),
  );
  return ok(
    generateGraphCorpusData({
      priorKnowledge: extractPriorKnowledge(units),
      threads: extractThreads(units),
      lessons: extractLessons(lessons),
      unitLessons: extractUnitLessons(units.map((entry) => entry.unit)),
      misconceptions: extractMisconceptions(lessons),
      keywords: extractKeywords(lessons),
      sourceVersion: bulk.fetchedAt,
    }),
  );
}

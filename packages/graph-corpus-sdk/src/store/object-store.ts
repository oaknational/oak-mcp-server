import { createHash, randomUUID } from 'node:crypto';
import { link, mkdir, open, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { hostname } from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import { err, ok, type Result } from '@oaknational/result';

import { isRecord } from './corpus-shape.js';
import { GraphRefreshError } from './refresh-error.js';

/** A stored body and a token that changes whenever the body changes. */
export interface VersionedObject {
  readonly body: string;
  readonly version: string;
}

/** Keys are slash-separated paths such as `graph-corpus/v1/latest.json`. */
export interface ObjectStore {
  get(key: string): Promise<string | null>;
  getVersioned(key: string): Promise<VersionedObject | null>;
  put(key: string, body: string): Promise<void>;
  /**
   * Writes `body` only while `key` is still at `version`, or still absent when
   * `version` is `null`. Resolves `false` when it is not.
   */
  putIfVersion(key: string, body: string, version: string | null): Promise<boolean>;
  /** Keys directly under `prefix`, which ends with `/`. */
  list(prefix: string): Promise<readonly string[]>;
  delete(keys: readonly string[]): Promise<void>;
}

function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code;
}

const versionOf = (body: string): string => createHash('sha256').update(body).digest('hex');

const LOCK_WAIT_MS = 5_000;
const LOCK_POLL_MS = 20;

interface LockHolder {
  readonly pid: number;
  readonly host: string;
  readonly startedAt: string;
  readonly id: string;
}

function parseLockHolder(text: string): LockHolder | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(value)) {
    return null;
  }
  const { pid, host, startedAt, id } = value;
  return typeof pid === 'number' &&
    Number.isSafeInteger(pid) &&
    pid > 0 &&
    typeof host === 'string' &&
    typeof startedAt === 'string' &&
    typeof id === 'string'
    ? { pid, host, startedAt, id }
    : null;
}

function hasExited(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    return hasCode(error, 'ESRCH');
  }
}

async function readOrNull(file: string): Promise<string | null> {
  try {
    return await readFile(file, 'utf8');
  } catch (error) {
    if (hasCode(error, 'ENOENT')) {
      return null;
    }
    throw error;
  }
}

type LockState =
  | { readonly kind: 'absent' }
  | { readonly kind: 'unrecorded' }
  | { readonly kind: 'other-host' | 'running' | 'exited'; readonly holder: LockHolder };

function judgeLock(text: string | null): LockState {
  if (text === null) {
    return { kind: 'absent' };
  }
  const holder = parseLockHolder(text);
  if (holder === null) {
    return { kind: 'unrecorded' };
  }
  if (holder.host !== hostname()) {
    return { kind: 'other-host', holder };
  }
  return { kind: hasExited(holder.pid) ? 'exited' : 'running', holder };
}

function describeLock(lock: string, state: LockState): string {
  switch (state.kind) {
    case 'absent':
      return `${lock} does not exist`;
    case 'unrecorded':
      return `${lock} has no holder record; delete it if no refresh is running`;
    case 'other-host':
      return `${lock} is held by pid ${String(state.holder.pid)} on ${state.holder.host}, another host`;
    case 'running':
      return `${lock} is held by pid ${String(state.holder.pid)} on ${state.holder.host}, which is running`;
    case 'exited':
      return (
        `${lock} is held by pid ${String(state.holder.pid)} on ${state.holder.host}, which has exited; ` +
        'run `pnpm graph:refresh --store local --break-stale-lock` if no refresh is running'
      );
  }
}

async function recordIfLockTaken(lock: string): Promise<string | null> {
  const id = randomUUID();
  const record = JSON.stringify({
    pid: process.pid,
    host: hostname(),
    startedAt: new Date().toISOString(),
    id,
  } satisfies LockHolder);
  const temp = `${lock}.${id}.tmp`;
  await writeFile(temp, record, 'utf8');
  try {
    await link(temp, lock);
    return record;
  } catch (error) {
    if (hasCode(error, 'EEXIST')) {
      return null;
    }
    throw error;
  } finally {
    await rm(temp, { force: true });
  }
}

async function releaseOwnLock(lock: string, record: string): Promise<void> {
  if ((await readOrNull(lock)) === record) {
    await rm(lock, { force: true });
  }
}

async function whileLocked<T>(file: string, write: () => Promise<T>): Promise<T> {
  const lock = `${file}.lock`;
  const deadline = Date.now() + LOCK_WAIT_MS;
  let record: string | null;
  while ((record = await recordIfLockTaken(lock)) === null) {
    if (Date.now() >= deadline) {
      const state = judgeLock(await readOrNull(lock));
      if (state.kind !== 'absent') {
        throw new GraphRefreshError(
          'lock-held',
          `${describeLock(lock, state)} (waited ${String(LOCK_WAIT_MS)} ms)`,
        );
      }
    }
    await sleep(LOCK_POLL_MS);
  }
  try {
    return await write();
  } finally {
    await releaseOwnLock(lock, record);
  }
}

const localFile = (root: string, key: string): string => path.join(root, ...key.split('/'));

/**
 * Removes the lock on `key` under `root` only when its record names a process
 * on this host that has exited. Refuses while another break holds `<lock>.break`.
 */
export async function breakStaleLocalLock(
  root: string,
  key: string,
): Promise<Result<string, string>> {
  const lock = `${localFile(root, key)}.lock`;
  const breaking = `${lock}.break`;
  try {
    await (await open(breaking, 'wx')).close();
  } catch (error) {
    if (hasCode(error, 'EEXIST')) {
      return err(
        `${breaking} exists: another break is running, or one crashed; delete it if none is running`,
      );
    }
    throw error;
  }
  try {
    const state = judgeLock(await readOrNull(lock));
    if (state.kind !== 'exited') {
      return err(describeLock(lock, state));
    }
    await rm(lock);
    return ok(
      `removed ${lock}, held by pid ${String(state.holder.pid)} on ${state.holder.host}, which had exited`,
    );
  } finally {
    await rm(breaking, { force: true });
  }
}

/** Stores each key as a file under `root`. */
export function createLocalFileObjectStore(root: string): ObjectStore {
  const fileFor = (key: string): string => localFile(root, key);
  const read = (key: string): Promise<string | null> => readOrNull(fileFor(key));
  const replace = async (file: string, body: string): Promise<void> => {
    const temp = `${file}.${randomUUID()}.tmp`;
    try {
      await writeFile(temp, body, 'utf8');
      await rename(temp, file);
    } finally {
      await rm(temp, { force: true });
    }
  };
  return {
    get: read,
    async getVersioned(key) {
      const body = await read(key);
      return body === null ? null : { body, version: versionOf(body) };
    },
    async put(key, body) {
      const file = fileFor(key);
      await mkdir(path.dirname(file), { recursive: true });
      await replace(file, body);
    },
    async putIfVersion(key, body, version) {
      const file = fileFor(key);
      await mkdir(path.dirname(file), { recursive: true });
      return whileLocked(file, async () => {
        const current = await read(key);
        if ((current === null ? null : versionOf(current)) !== version) {
          return false;
        }
        await replace(file, body);
        return true;
      });
    },
    async list(prefix) {
      try {
        const entries = await readdir(fileFor(prefix), { withFileTypes: true });
        return entries.filter((entry) => entry.isFile()).map((entry) => `${prefix}${entry.name}`);
      } catch (error) {
        if (hasCode(error, 'ENOENT')) {
          return [];
        }
        throw error;
      }
    },
    async delete(keys) {
      await Promise.all(keys.map((key) => rm(fileFor(key), { force: true })));
    },
  };
}

/** The slice of `@vercel/blob` the Blob store calls. */
export interface BlobClient {
  get(
    pathname: string,
    options: { access: 'private'; useCache: false; token?: string },
  ): Promise<{ stream: ReadableStream<Uint8Array> | null; blob: { etag: string } } | null>;
  put(
    pathname: string,
    body: string,
    options: {
      access: 'private';
      addRandomSuffix: false;
      allowOverwrite: boolean;
      ifMatch?: string;
      contentType: string;
      token?: string;
    },
  ): Promise<unknown>;
  list(options: {
    prefix: string;
    cursor?: string;
    token?: string;
  }): Promise<{ blobs: readonly { pathname: string }[]; cursor?: string; hasMore: boolean }>;
  del(pathnames: string[], options?: { token?: string }): Promise<void>;
}

/** Stores each key as a private Vercel Blob. */
export function createBlobObjectStore(client: BlobClient, token?: string): ObjectStore {
  const auth = token === undefined ? {} : { token };
  const write = {
    access: 'private',
    addRandomSuffix: false,
    contentType: 'application/json; charset=utf-8',
    ...auth,
  } as const;
  const getVersioned = async (key: string): Promise<VersionedObject | null> => {
    const result = await client.get(key, { access: 'private', useCache: false, ...auth });
    if (result?.stream == null) {
      return null;
    }
    return { body: await new Response(result.stream).text(), version: result.blob.etag };
  };
  return {
    async get(key) {
      return (await getVersioned(key))?.body ?? null;
    },
    getVersioned,
    async put(key, body) {
      await client.put(key, body, { ...write, allowOverwrite: true });
    },
    async putIfVersion(key, body, version) {
      if (version === '') {
        throw new GraphRefreshError(
          'missing-etag',
          `${key} was read without an ETag, so it cannot be written only if unchanged`,
        );
      }
      try {
        await client.put(
          key,
          body,
          version === null
            ? { ...write, allowOverwrite: false }
            : { ...write, allowOverwrite: true, ifMatch: version },
        );
        return true;
      } catch (error) {
        // The SDK has no error class for an existing blob, so the version tells a lost race from a failure.
        const reread = await getVersioned(key).then(
          (current) => ({ current }),
          (readError: unknown) => ({ readError }),
        );
        if ('readError' in reread) {
          const { readError } = reread;
          throw new Error(
            `writing ${key} failed, then reading its version failed: ${readError instanceof Error ? readError.message : String(readError)}`,
            { cause: error },
          );
        }
        if ((reread.current?.version ?? null) !== version) {
          return false;
        }
        throw error;
      }
    },
    async list(prefix) {
      const keys: string[] = [];
      let cursor: string | undefined;
      do {
        const page = await client.list({
          prefix,
          ...auth,
          ...(cursor === undefined ? {} : { cursor }),
        });
        keys.push(
          ...page.blobs
            .map((blob) => blob.pathname)
            .filter((pathname) => !pathname.slice(prefix.length).includes('/')),
        );
        cursor = page.hasMore ? page.cursor : undefined;
      } while (cursor !== undefined);
      return keys;
    },
    async delete(keys) {
      if (keys.length > 0) {
        await client.del([...keys], auth);
      }
    },
  };
}

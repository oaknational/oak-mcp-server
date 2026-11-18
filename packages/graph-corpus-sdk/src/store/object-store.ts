import { createHash, randomUUID } from 'node:crypto';
import { link, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { hostname } from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

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

async function tryTakeLockWithHolderRecord(lock: string): Promise<boolean> {
  const holder: LockHolder = {
    pid: process.pid,
    host: hostname(),
    startedAt: new Date().toISOString(),
    id: randomUUID(),
  };
  const temp = `${lock}.${holder.id}.tmp`;
  await writeFile(temp, JSON.stringify(holder), 'utf8');
  try {
    await link(temp, lock);
    return true;
  } catch (error) {
    if (hasCode(error, 'EEXIST')) {
      return false;
    }
    throw error;
  } finally {
    await rm(temp, { force: true });
  }
}

async function breakStaleLock(lock: string, stale: string): Promise<void> {
  const aside = `${lock}.${randomUUID()}.stale`;
  try {
    await rename(lock, aside);
  } catch (error) {
    if (hasCode(error, 'ENOENT')) {
      return;
    }
    throw error;
  }
  const retakenByAnotherWaiter = (await readFile(aside, 'utf8')) !== stale;
  if (retakenByAnotherWaiter) {
    await link(aside, lock);
  }
  await rm(aside, { force: true });
}

async function whileLocked<T>(file: string, write: () => Promise<T>): Promise<T> {
  const lock = `${file}.lock`;
  const deadline = Date.now() + LOCK_WAIT_MS;
  while (!(await tryTakeLockWithHolderRecord(lock))) {
    const held = await readOrNull(lock);
    const holder = held === null ? null : parseLockHolder(held);
    if (held !== null && holder?.host === hostname() && hasExited(holder.pid)) {
      await breakStaleLock(lock, held);
      continue;
    }
    if (Date.now() >= deadline) {
      const by =
        holder === null
          ? ''
          : ` by pid ${String(holder.pid)} on ${holder.host} since ${holder.startedAt}`;
      throw new Error(
        `${lock} was held${by} for ${String(LOCK_WAIT_MS)} ms; delete it if no refresh is running`,
      );
    }
    await sleep(LOCK_POLL_MS);
  }
  try {
    return await write();
  } finally {
    await rm(lock, { force: true });
  }
}

/** Stores each key as a file under `root`. */
export function createLocalFileObjectStore(root: string): ObjectStore {
  const fileFor = (key: string): string => path.join(root, ...key.split('/'));
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

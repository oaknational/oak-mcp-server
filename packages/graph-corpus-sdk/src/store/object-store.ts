import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

/** A stored body and a token that changes whenever the body is replaced. */
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
   * `version` is `null`. Resolves `false`, writing nothing, when it is not.
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

/** Runs `write` while holding `<file>.lock`, created exclusively so other processes wait. */
async function whileLocked<T>(file: string, write: () => Promise<T>): Promise<T> {
  const lock = `${file}.lock`;
  const deadline = Date.now() + LOCK_WAIT_MS;
  for (;;) {
    try {
      await (await open(lock, 'wx')).close();
      break;
    } catch (error) {
      if (!hasCode(error, 'EEXIST')) {
        throw error;
      }
      if (Date.now() >= deadline) {
        throw new Error(
          `${lock} was held for ${String(LOCK_WAIT_MS)} ms; delete it if no refresh is running`,
          { cause: error },
        );
      }
      await sleep(LOCK_POLL_MS);
    }
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
  const read = async (key: string): Promise<string | null> => {
    try {
      return await readFile(fileFor(key), 'utf8');
    } catch (error) {
      if (hasCode(error, 'ENOENT')) {
        return null;
      }
      throw error;
    }
  };
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

const JSON_TYPE = 'application/json; charset=utf-8';

/** Stores each key as a private Vercel Blob. */
export function createBlobObjectStore(client: BlobClient, token?: string): ObjectStore {
  const auth = token === undefined ? {} : { token };
  const write = {
    access: 'private',
    addRandomSuffix: false,
    contentType: JSON_TYPE,
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
        // The SDK names an ETag mismatch but not an existing blob, so read the version to tell a lost race from a failure.
        if (((await getVersioned(key))?.version ?? null) !== version) {
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

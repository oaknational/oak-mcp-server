import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** Keys are slash-separated paths such as `graph-corpus/v1/latest.json`. */
export interface ObjectStore {
  get(key: string): Promise<string | null>;
  put(key: string, body: string): Promise<void>;
  /** Keys directly under `prefix`, which ends with `/`. */
  list(prefix: string): Promise<readonly string[]>;
  delete(keys: readonly string[]): Promise<void>;
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

/** Stores each key as a file under `root`. */
export function createLocalFileObjectStore(root: string): ObjectStore {
  const fileFor = (key: string): string => path.join(root, ...key.split('/'));
  return {
    async get(key) {
      try {
        return await readFile(fileFor(key), 'utf8');
      } catch (error) {
        if (isMissingFile(error)) {
          return null;
        }
        throw error;
      }
    },
    async put(key, body) {
      const file = fileFor(key);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, body, 'utf8');
    },
    async list(prefix) {
      try {
        const entries = await readdir(fileFor(prefix), { withFileTypes: true });
        return entries.filter((entry) => entry.isFile()).map((entry) => `${prefix}${entry.name}`);
      } catch (error) {
        if (isMissingFile(error)) {
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
    options: { access: 'private'; token?: string },
  ): Promise<{ stream: ReadableStream<Uint8Array> | null } | null>;
  put(
    pathname: string,
    body: string,
    options: {
      access: 'private';
      addRandomSuffix: false;
      allowOverwrite: true;
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
  return {
    async get(key) {
      const blob = await client.get(key, { access: 'private', ...auth });
      if (blob?.stream == null) {
        return null;
      }
      return new Response(blob.stream).text();
    },
    async put(key, body) {
      await client.put(key, body, {
        access: 'private',
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: 'application/json; charset=utf-8',
        ...auth,
      });
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

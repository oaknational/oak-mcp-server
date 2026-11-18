import type { BlobClient } from '../object-store.js';

type PutOptions = Parameters<BlobClient['put']>[2];

/**
 * In-memory stand-in for `@vercel/blob` that pages `list` two blobs at a time
 * and honours `allowOverwrite` and `ifMatch` the way the Blob API does.
 */
export function createFakeBlobClient(): BlobClient & {
  readonly blobs: Map<string, string>;
  readonly puts: { readonly pathname: string; readonly options: PutOptions }[];
} {
  const blobs = new Map<string, string>();
  const etags = new Map<string, string>();
  const puts: { pathname: string; options: PutOptions }[] = [];
  let writes = 0;
  return {
    blobs,
    puts,
    get(pathname) {
      const body = blobs.get(pathname);
      return Promise.resolve(
        body === undefined
          ? null
          : { stream: new Blob([body]).stream(), blob: { etag: etags.get(pathname) ?? '' } },
      );
    },
    put(pathname, body, options) {
      puts.push({ pathname, options });
      const exists = blobs.has(pathname);
      if (!options.allowOverwrite && exists) {
        return Promise.reject(new Error('This blob already exists'));
      }
      if (options.ifMatch !== undefined && options.ifMatch !== etags.get(pathname)) {
        return Promise.reject(new Error('Precondition failed: ETag mismatch.'));
      }
      writes += 1;
      blobs.set(pathname, body);
      etags.set(pathname, `"etag-${String(writes)}"`);
      return Promise.resolve({ pathname });
    },
    list({ prefix, cursor }) {
      const all = [...blobs.keys()].filter((key) => key.startsWith(prefix)).sort();
      const start = cursor === undefined ? 0 : Number(cursor);
      const page = all.slice(start, start + 2).map((pathname) => ({ pathname }));
      const hasMore = start + 2 < all.length;
      return Promise.resolve({
        blobs: page,
        hasMore,
        ...(hasMore ? { cursor: String(start + 2) } : {}),
      });
    },
    del(pathnames) {
      for (const pathname of pathnames) {
        blobs.delete(pathname);
        etags.delete(pathname);
      }
      return Promise.resolve();
    },
  };
}

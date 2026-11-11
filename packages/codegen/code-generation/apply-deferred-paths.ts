/**
 * Remove owner-deferred upstream paths from an OpenAPI document before generation.
 *
 * Single-application semantics: every configured path must be present in the input,
 * and the function throws per missing path. That throw is the tripwire this module
 * exists for — it fires when upstream renames or removes a deferred path, so the
 * deferral list can never silently drift from the schema it narrows.
 */

import type { OpenAPIObject } from 'openapi3-ts/oas31';
import { DEFERRED_PATHS, type DeferredPathEntry } from './excluded-paths.js';

/**
 * @throws TypeError per deferred path absent from the document, naming the path,
 *   its deferral ticket, and the remedy.
 */
export function applyDeferredPaths(
  doc: OpenAPIObject,
  deferred: readonly DeferredPathEntry[] = DEFERRED_PATHS,
): OpenAPIObject {
  const paths = doc.paths ?? {};
  for (const entry of deferred) {
    if (!(entry.path in paths)) {
      throw new TypeError(
        `Deferred path "${entry.path}" (deferral ticket ${entry.ticket}) is absent from the ` +
          `OpenAPI document. Upstream has renamed or removed it: re-verify the family against ` +
          `the live spec and update DEFERRED_PATHS in excluded-paths.ts before regenerating.`,
      );
    }
  }
  const deferredPathSet = new Set(deferred.map((entry) => entry.path));
  const remaining = Object.fromEntries(
    Object.entries(paths).filter(([path]) => !deferredPathSet.has(path)),
  );
  return { ...doc, paths: remaining };
}

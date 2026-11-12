/**
 * Parameter description overrides for known upstream OpenAPI spec bugs.
 *
 * Each override corrects a specific parameter description that is wrong in the
 * upstream schema. Overrides are keyed by `{path}:{paramName}` and include the
 * incorrect upstream description so that a schema-cache test can detect when
 * the upstream wording moves and flag the override for re-adjudication
 * (removal if upstream is now correct; re-pin if still wrong).
 *
 * @see upstream-param-description-overrides.unit.test.ts — removal-condition test
 */

import type { ParamMetadataMap } from './param-metadata.js';

interface ParamDescriptionOverride {
  /** The correct description to use instead of the upstream one */
  readonly correctDescription: string;
  /** The known-incorrect upstream description (used by the removal-condition test) */
  readonly upstreamBuggyDescription: string;
}

/**
 * Map of `{openApiPath}:{paramName}` to override definitions.
 *
 * When the upstream wording moves, the schema-cache test detects that the
 * cached description no longer matches `upstreamBuggyDescription` and fails,
 * signalling that the override needs re-adjudication against the endpoint's
 * actual behaviour.
 */
const PARAM_DESCRIPTION_OVERRIDES: Readonly<Record<string, ParamDescriptionOverride>> = {
  // The upstream defect evolved (spec 0.7.x, 2026-07): the original swapped
  // descriptions became generic whole-list pagination text, but the handler
  // behaviour is unchanged and remains per-unit — so the overrides stay
  // (keep + re-pin ratified at the 2026-08-03 owner card).
  '/key-stages/{keyStage}/subject/{subject}/lessons:offset': {
    correctDescription: 'Offset applied to lessons within each unit (not to the unit list).',
    upstreamBuggyDescription:
      'If limiting results returned, this allows you to return the next set of results, starting at the given offset point',
  },
  '/key-stages/{keyStage}/subject/{subject}/lessons:limit': {
    correctDescription:
      'Limit the number of lessons returned per unit. Units with zero lessons after limiting are omitted.',
    upstreamBuggyDescription: 'Limit the number of lessons, e.g. return a maximum of 300 lessons',
  },
};

/**
 * Apply parameter description overrides to correct known upstream spec bugs.
 *
 * Mutates the metadata maps in place — call after `buildParamMetadataForOperation`.
 */
export function applyParamDescriptionOverrides(
  path: string,
  pathParamMetadata: ParamMetadataMap,
  queryParamMetadata: ParamMetadataMap,
): void {
  for (const [key, override] of Object.entries(PARAM_DESCRIPTION_OVERRIDES)) {
    const [overridePath, paramName] = key.split(':');
    if (overridePath !== path || !paramName) {
      continue;
    }
    for (const map of [pathParamMetadata, queryParamMetadata]) {
      const target = map[paramName];
      if (target) {
        map[paramName] = { ...target, description: override.correctDescription };
      }
    }
  }
}

/**
 * Exported for the removal-condition test only.
 *
 * The test reads the schema cache and checks whether each override's
 * `upstreamBuggyDescription` still matches the cached description. When it
 * no longer matches, the upstream wording has moved and the override is
 * re-adjudicated: removed if upstream now describes the behaviour correctly,
 * re-pinned if the new wording is still wrong.
 */
export { PARAM_DESCRIPTION_OVERRIDES };

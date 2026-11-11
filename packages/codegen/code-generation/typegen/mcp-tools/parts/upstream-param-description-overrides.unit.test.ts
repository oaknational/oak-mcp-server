/**
 * Removal-condition test for parameter description overrides.
 *
 * This test reads the schema cache and verifies that each override's
 * `upstreamBuggyDescription` still matches what the upstream spec provides.
 * When the upstream wording moves, this test FAILS — that failure is the
 * signal to RE-ADJUDICATE the override (remove it if upstream is now correct;
 * re-pin it if the new wording is still wrong), never an instruction to
 * remove on sight.
 *
 * @see param-description-overrides.ts
 * @see docs/spikes/upstream-offset-limit-description-swap.md
 */
import { describe, it, expect } from 'vitest';

import {
  loadSchemaCachePaths,
  type SchemaCachePaths,
} from '../test-helpers/schema-cache-reader.js';

import { PARAM_DESCRIPTION_OVERRIDES } from './param-description-overrides.js';

function getParamDescription(
  paths: SchemaCachePaths,
  apiPath: string,
  paramName: string,
): string | undefined {
  const pathItem = paths[apiPath];
  if (!pathItem) {
    return undefined;
  }
  for (const operation of Object.values(pathItem)) {
    if (!operation.parameters) {
      continue;
    }
    const param = operation.parameters.find((p) => p.name === paramName);
    if (param) {
      return param.description ?? param.schema?.description;
    }
  }
  return undefined;
}

describe('upstream parameter description overrides — removal conditions', () => {
  const paths = loadSchemaCachePaths();

  for (const [key, override] of Object.entries(PARAM_DESCRIPTION_OVERRIDES)) {
    const separatorIndex = key.lastIndexOf(':');
    const apiPath = key.slice(0, separatorIndex);
    const paramName = key.slice(separatorIndex + 1);

    it(`override for ${apiPath} param "${paramName}" is still needed (upstream bug persists)`, () => {
      const cachedDescription = getParamDescription(paths, apiPath, paramName);

      // When this assertion fails, the upstream wording has MOVED — which may
      // mean the defect is fixed, or may be ordinary copy churn that leaves it
      // uncured. Re-adjudicate; never remove the override on this signal alone.
      expect(
        cachedDescription,
        `Upstream description for "${paramName}" on ${apiPath} no longer matches ` +
          `the pinned value — the upstream wording has MOVED. Read the new text ` +
          `against the endpoint's actual behaviour (per-unit offset/limit) before ` +
          `acting: if upstream now describes the behaviour correctly, remove the ` +
          `override from param-description-overrides.ts and re-run pnpm sdk-codegen; ` +
          `if the new text is still wrong, keep the override and re-pin ` +
          `upstreamBuggyDescription to the new text, recording the adjudication.`,
      ).toBe(override.upstreamBuggyDescription);
    });
  }
});

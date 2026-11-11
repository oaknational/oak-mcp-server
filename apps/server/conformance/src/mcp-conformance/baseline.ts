/**
 * Pure named-verdict comparison of one parsed MCPJam json-summary report
 * against one committed baseline (MCP-189). No IO — callers hand in parsed,
 * boundary-validated values; the comparison is deterministic and
 * target-agnostic (it reads check ids, statuses, and error text only, never
 * the report's `target` or duration fields).
 */
import { typeSafeHasOwn, typeSafeKeys } from '../core/type-helpers.js';

import { type Baseline, type ExpectedCheck } from './baseline-schema.js';
import { type Divergence, type McpjamCase, type McpjamReport } from './types.js';

/**
 * Flatten every group's cases into one id-keyed map. Duplicate ids across
 * groups are surfaced as divergences, never last-wins — under the floating
 * dependency range a future mcpjam could emit one id twice (a failed then a
 * passed instance), and silent last-wins would mask exactly the failure
 * this module exists to expose.
 */
function casesById(report: McpjamReport): {
  readonly byId: ReadonlyMap<string, McpjamCase>;
  readonly duplicates: readonly Divergence[];
} {
  const byId = new Map<string, McpjamCase>();
  const duplicates: Divergence[] = [];
  for (const group of report.groups) {
    for (const oneCase of group.cases) {
      if (byId.has(oneCase.id)) {
        duplicates.push({
          kind: 'duplicate-check',
          checkId: oneCase.id,
          message: `check "${oneCase.id}" appears more than once in the run — ambiguous verdict input (tool drift); adjudicate and re-seed deliberately`,
        });
      } else {
        byId.set(oneCase.id, oneCase);
      }
    }
  }
  return { byId, duplicates };
}

function compareFailedCase(observed: McpjamCase, expected: ExpectedCheck): Divergence | undefined {
  if (expected.status !== 'fail') {
    return {
      kind: 'unexpected-failure',
      checkId: observed.id,
      message: `check "${observed.id}" failed but the baseline expects ${expected.status}: ${observed.error ?? '(no error text)'}`,
    };
  }
  if (!(observed.error ?? '').includes(expected.errorIncludes)) {
    return {
      kind: 'failure-shape-mismatch',
      checkId: observed.id,
      message: `check "${observed.id}" failed as expected but the error no longer contains "${expected.errorIncludes}": ${observed.error ?? '(no error text)'}`,
    };
  }
  return undefined;
}

function compareSkippedCase(observed: McpjamCase, expected: ExpectedCheck): Divergence | undefined {
  if (expected.status !== 'skip') {
    return {
      kind: 'new-skip',
      checkId: observed.id,
      message: `check "${observed.id}" skipped but the baseline expects ${expected.status}: ${observed.error ?? '(no skip reason)'}`,
    };
  }
  // The REASON is part of the pin: an expected skip matched on status alone
  // would let a broken-prerequisite skip read as the applicability skip that
  // was baselined.
  if (!(observed.error ?? '').includes(expected.reasonIncludes)) {
    return {
      kind: 'skip-reason-mismatch',
      checkId: observed.id,
      message: `check "${observed.id}" skipped as expected but the reason no longer contains "${expected.reasonIncludes}": ${observed.error ?? '(no skip reason)'}`,
    };
  }
  return undefined;
}

function comparePassedCase(observed: McpjamCase, expected: ExpectedCheck): Divergence | undefined {
  if (expected.status === 'skip') {
    return {
      kind: 'vanished-skip',
      checkId: observed.id,
      message: `check "${observed.id}" passed but the baseline expects a skip — the expected-skip set moved; adjudicate and re-seed deliberately`,
    };
  }
  if (expected.status === 'fail') {
    return {
      kind: 'unexpected-pass',
      checkId: observed.id,
      message: `check "${observed.id}" passed but the baseline expects a failure containing "${expected.errorIncludes}" — the expected terminal state moved`,
    };
  }
  return undefined;
}

function compareObservedCase(observed: McpjamCase, baseline: Baseline): Divergence | undefined {
  // Own-property guard: `expected` is a plain object, so a bare index for a
  // novel check named `toString`/`constructor` would resolve an inherited
  // prototype member and silently skip the novel-check branch.
  const expected = typeSafeHasOwn(baseline.expected, observed.id)
    ? baseline.expected[observed.id]
    : undefined;
  if (expected === undefined) {
    return {
      kind: 'novel-check',
      checkId: observed.id,
      message: `check "${observed.id}" (${observed.status}) is not in the ${baseline.suite}/${baseline.mode} baseline — tool drift or a baseline edit; adjudicate and re-seed deliberately`,
    };
  }
  switch (observed.status) {
    case 'failed':
      return compareFailedCase(observed, expected);
    case 'skipped':
      return compareSkippedCase(observed, expected);
    case 'passed':
      return comparePassedCase(observed, expected);
    default: {
      // Compile-time exhaustiveness: a new status in the vendor enum fails
      // the build here instead of silently mis-routing to a status branch.
      const exhaustive: never = observed.status;
      return exhaustive;
    }
  }
}

/**
 * Compare a parsed report against a baseline. The verdict is `pass` iff the
 * divergence list is empty: zero unexpected failures AND the observed
 * skip/fail sets exactly matching the baseline (the MCP-189 bar — a new or
 * vanished skip is a loud failure, never silent drift).
 */
export function compareRunToBaseline(
  report: McpjamReport,
  baseline: Baseline,
): { readonly verdict: 'pass' | 'fail'; readonly divergences: readonly Divergence[] } {
  const observed = casesById(report);
  const divergences: Divergence[] = [...observed.duplicates];

  for (const oneCase of observed.byId.values()) {
    const divergence = compareObservedCase(oneCase, baseline);
    if (divergence !== undefined) {
      divergences.push(divergence);
    }
  }

  for (const expectedId of typeSafeKeys(baseline.expected)) {
    if (!observed.byId.has(expectedId)) {
      divergences.push({
        kind: 'missing-check',
        checkId: expectedId,
        message: `baseline check "${expectedId}" is absent from the run — tool drift (a removed or renamed check); adjudicate and re-seed deliberately`,
      });
    }
  }

  return { verdict: divergences.length === 0 ? 'pass' : 'fail', divergences };
}

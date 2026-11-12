/**
 * Per-suite pipelines for `agent-tools mcp-conformance` (MCP-189): the two
 * operations' suite runners over the evidence phase. `suite-evidence.ts`
 * owns spawn → retain → operational-exit gate → parse; `report.ts`
 * aggregates these; `suite-outcome.ts` composes the outcomes.
 */
import { err, isErr, ok, type Result } from '@oaknational/result';

import { type McpConformanceIo, type McpConformanceRunInput } from './io-port.js';
import { gatherSuiteEvidence } from './suite-evidence.js';
import { buildSuiteOutcome, compareAndCompose, type EvidenceFields } from './suite-outcome.js';
import { type Baseline } from './baseline-schema.js';
import { type ConformanceSuite, type McpjamReport, type SuiteOutcome } from './types.js';

const SEED_HINT =
  'no verdict was attempted — run the same invocation with --seed to capture observation reports for authoring the missing baseline';

const ENTRY_ABORT =
  'not run: entry validation failed for another suite in this verdict run — fix the named baseline problem and rerun';

function resolveBaseline(
  input: McpConformanceRunInput,
  suite: ConformanceSuite,
): Result<Baseline, string> {
  const loadOutcome = input.baselines[suite];
  if (loadOutcome === undefined) {
    return err(
      `no ${input.mode} baseline is available for the "${suite}" suite — a run without a baseline has no verdict semantics`,
    );
  }
  if (loadOutcome.kind === 'invalid') {
    return err(
      `the ${input.mode} baseline for the "${suite}" suite is unusable: ${loadOutcome.reason}`,
    );
  }
  return ok(loadOutcome.baseline);
}

/** One launched suite under either operation; `onParsed` supplies the operation's parsed arm. */
function runLaunchedSuite(
  io: McpConformanceIo,
  input: McpConformanceRunInput,
  suite: ConformanceSuite,
  onParsed: (gathered: {
    readonly report: McpjamReport;
    readonly retentionReasons: readonly string[];
    readonly evidence: EvidenceFields;
  }) => SuiteOutcome,
): SuiteOutcome {
  const gathered = gatherSuiteEvidence(io, input, suite);
  switch (gathered.kind) {
    case 'launch-failure':
      return buildSuiteOutcome({
        suite,
        operation: input.operation,
        failureReasons: [gathered.reason],
        divergences: [],
      });
    // One arm for both ran-but-failed states: they compose identically —
    // the distinction lives in the SuiteEvidence kind and the reason text.
    case 'operational-exit':
    case 'unparseable':
      return buildSuiteOutcome({
        suite,
        operation: input.operation,
        failureReasons: [gathered.reason, ...gathered.retentionReasons],
        divergences: [],
        ...gathered.evidence,
      });
    case 'parsed':
      return onParsed(gathered);
    default: {
      // Compile-time exhaustiveness over the evidence phase's terminal states.
      const exhaustive: never = gathered;
      return exhaustive;
    }
  }
}

/** The verdict operation: fail-fast entry validation, then run + compare. */
export function runVerdictSuites(
  io: McpConformanceIo,
  input: McpConformanceRunInput,
): readonly SuiteOutcome[] {
  const resolved = input.suites.map((suite) => ({
    suite,
    baseline: resolveBaseline(input, suite),
  }));
  const anyBroken = resolved.some(({ baseline }) => isErr(baseline));
  return resolved.map(({ suite, baseline }) => {
    if (isErr(baseline)) {
      return buildSuiteOutcome({
        suite,
        operation: 'verdict',
        failureReasons: [baseline.error, SEED_HINT],
        divergences: [],
      });
    }
    if (anyBroken) {
      return buildSuiteOutcome({
        suite,
        operation: 'verdict',
        failureReasons: [ENTRY_ABORT],
        divergences: [],
      });
    }
    return runLaunchedSuite(io, input, suite, (gathered) =>
      compareAndCompose({
        suite,
        baseline: baseline.value,
        report: gathered.report,
        retentionReasons: gathered.retentionReasons,
        evidence: gathered.evidence,
      }),
    );
  });
}

/** The seed operation: capture-only — a parsed, retained capture passes. */
export function runSeedSuites(
  io: McpConformanceIo,
  input: McpConformanceRunInput,
): readonly SuiteOutcome[] {
  return input.suites.map((suite) =>
    runLaunchedSuite(io, input, suite, (gathered) =>
      buildSuiteOutcome({
        suite,
        operation: 'seed',
        failureReasons: gathered.retentionReasons,
        divergences: [],
        ...gathered.evidence,
      }),
    ),
  );
}

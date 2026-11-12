/**
 * Suite-outcome composition for `agent-tools mcp-conformance` (MCP-189).
 *
 * One composition edge for the wrapper's per-suite outcome: callers hand in
 * the evidence they gathered (retained path, child exit code) plus a LIST of
 * failure reasons, and the outcome is built in one place. Reasons stay a
 * list all the way into the report — child streams can contain any
 * separator, so a joined string would be lossy on arrival — and
 * simultaneous failure classes (a retention failure alongside a clean
 * comparison, an unparseable capture in a seed run) are all reported
 * instead of racing each other for one string slot.
 */
import { type Baseline } from './baseline-schema.js';
import { compareRunToBaseline } from './baseline.js';
import { boundedExcerpt } from './bounded-excerpt.js';
import { type RetentionOutcome } from './io-port.js';
import { type McpjamSpawnResult } from './runner.js';
import {
  type ConformanceOperation,
  type ConformanceSuite,
  type Divergence,
  type McpjamReport,
  type SuiteOutcome,
} from './types.js';

/** Evidence fields every launched suite carries into its outcome. */
export interface EvidenceFields {
  readonly rawReportPath?: string;
  readonly mcpjamExitCode?: number;
  /**
   * Bounded excerpt of mcpjam's stderr when the run still produced a usable
   * report. A vendor deprecation or configuration warning arrives here while
   * the run exits 0 and matches its baseline; dropping it would let the
   * wrapper report a clean verdict over a warning nobody ever sees
   * (no-warning-toleration). Diagnostics, not evidence — the retained raw
   * report is the evidence.
   */
  readonly mcpjamStderr?: string;
}

/**
 * The optional evidence fields a launched suite carries, whichever arm it
 * takes. `mcpjamStderr` rides the PARSED arm too: a run can emit a vendor
 * deprecation warning and still produce a baseline-matching report, and a
 * warning only present in a stream nobody reads is a tolerated warning.
 */
export function composeEvidence(
  retention: RetentionOutcome,
  spawned: McpjamSpawnResult,
): EvidenceFields {
  const stderrExcerpt = boundedExcerpt('mcpjam stderr', spawned.stderr);
  return {
    ...(retention.ok ? { rawReportPath: retention.reportedPath } : {}),
    ...(spawned.exitCode === undefined ? {} : { mcpjamExitCode: spawned.exitCode }),
    ...(stderrExcerpt === '' ? {} : { mcpjamStderr: stderrExcerpt }),
  };
}

/** Everything a suite outcome is composed from. */
export interface SuiteOutcomeParts {
  readonly suite: ConformanceSuite;
  readonly operation: ConformanceOperation;
  /** Every applicable failure reason; empty means the operation's bar was met. */
  readonly failureReasons: readonly string[];
  readonly divergences: readonly Divergence[];
  /** The baseline-comparison verdict, when comparison ran (verdict operation only). */
  readonly comparisonVerdict?: 'pass' | 'fail';
  readonly rawReportPath?: string;
  readonly mcpjamExitCode?: number;
  readonly mcpjamStderr?: string;
  readonly baselineResidualMasking?: string;
}

/**
 * The verdict decision table, total over the domain: any failure reason
 * forces `fail` (a passing comparison with failed retention is still a
 * failed suite — the evidence contract was not met); a clean SEED capture
 * passes (its bar is capture, never comparison); a clean VERDICT suite
 * takes its comparison verdict — and a verdict-op suite that never
 * reached comparison can never pass.
 */
function verdictOf(parts: SuiteOutcomeParts): 'pass' | 'fail' {
  if (parts.failureReasons.length > 0) {
    return 'fail';
  }
  if (parts.operation === 'seed') {
    return 'pass';
  }
  return parts.comparisonVerdict ?? 'fail';
}

/** Build the outcome; the verdict comes from the decision table above. */
export function buildSuiteOutcome(parts: SuiteOutcomeParts): SuiteOutcome {
  const verdict = verdictOf(parts);
  return {
    suite: parts.suite,
    verdict,
    ...(parts.rawReportPath === undefined ? {} : { rawReportPath: parts.rawReportPath }),
    ...(parts.mcpjamExitCode === undefined ? {} : { mcpjamExitCode: parts.mcpjamExitCode }),
    ...(parts.mcpjamStderr === undefined ? {} : { mcpjamStderr: parts.mcpjamStderr }),
    failureReasons: parts.failureReasons,
    divergences: parts.divergences,
    ...(parts.baselineResidualMasking === undefined
      ? {}
      : { baselineResidualMasking: parts.baselineResidualMasking }),
  };
}

/**
 * Compare a parsed report against its (entry-validated, guaranteed usable)
 * baseline and compose the verdict-operation outcome.
 */
export function compareAndCompose(input: {
  readonly suite: ConformanceSuite;
  readonly baseline: Baseline;
  readonly report: McpjamReport;
  readonly retentionReasons: readonly string[];
  readonly evidence: EvidenceFields;
}): SuiteOutcome {
  const comparison = compareRunToBaseline(input.report, input.baseline);
  return buildSuiteOutcome({
    suite: input.suite,
    operation: 'verdict',
    failureReasons: input.retentionReasons,
    divergences: comparison.divergences,
    comparisonVerdict: comparison.verdict,
    ...input.evidence,
    ...(input.baseline.residual_masking === undefined
      ? {}
      : { baselineResidualMasking: input.baseline.residual_masking }),
  });
}

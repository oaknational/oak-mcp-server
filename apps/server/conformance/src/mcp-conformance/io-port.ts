/**
 * IO ports and run-input contract for `agent-tools mcp-conformance`
 * (MCP-189). A contract-only module: the orchestration (`report.ts`,
 * `run-suite.ts`) and the adapters (`node-io.ts`, `load-baselines.ts`)
 * both depend on these shapes, never on each other.
 */
import { type Baseline } from './baseline-schema.js';
import { type McpjamRunner } from './runner.js';
import { type ConformanceMode, type ConformanceOperation, type ConformanceSuite } from './types.js';

/**
 * How a baseline arrived for one suite: loaded and valid, or present but
 * unusable (with the true cause — JSON syntax, schema rejection, identity
 * mismatch, or a non-absent read error). An ABSENT baseline is the absence
 * of an entry, so "file missing" and "file broken" are never conflated.
 */
export type BaselineLoadOutcome =
  | { readonly kind: 'loaded'; readonly baseline: Baseline }
  | { readonly kind: 'invalid'; readonly reason: string };

/** Outcome of one raw-report retention attempt. */
export type RetentionOutcome =
  | { readonly ok: true; readonly reportedPath: string }
  | { readonly ok: false; readonly error: string };

/** IO seam for the orchestration: spawn + raw-report retention only. */
export interface McpConformanceIo {
  readonly runMcpjam: McpjamRunner;
  /**
   * Persist one suite's raw stdout verbatim. A retention failure is loud in
   * the outcome but does not abort the suite — the parse still proceeds
   * from the in-memory stdout so the operator sees both problems at once.
   */
  readonly retainRawReport: (suite: ConformanceSuite, content: string) => RetentionOutcome;
}

export interface McpConformanceRunInput {
  readonly target: string;
  readonly operation: ConformanceOperation;
  readonly mode: ConformanceMode;
  readonly suites: readonly ConformanceSuite[];
  /** Per-suite baseline load outcomes; an absent entry means no baseline file. */
  readonly baselines: Readonly<Partial<Record<ConformanceSuite, BaselineLoadOutcome>>>;
  readonly credentialsFile?: string;
}

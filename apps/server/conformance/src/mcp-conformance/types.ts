/**
 * MCP-189 — `agent-tools mcp-conformance` (MCPJam suite wrapper).
 *
 * Schema-first boundary for the wrapper: every shape that crosses an
 * external boundary — the MCPJam `--reporter json-summary` report and the
 * committed baseline files — is a zod schema here with its type as
 * `z.infer`, never a hand-declared twin. The wrapper's own OUTPUT shapes
 * (`Divergence`, `SuiteOutcome`, `ConformanceRunReport`) are deliberately
 * hand-declared interfaces: they are synthesized by this module and never
 * re-parsed from unknown input, so a schema would be ceremony.
 *
 * The baseline is the behaviour pin (the ticket's design): the `@mcpjam/cli`
 * dependency floats on a compatible range, and drift is caught loudly by
 * name — a novel or vanished check id, a new or vanished skip, a failure
 * whose shape moved — never absorbed silently.
 *
 * Vendor call shapes verified first-hand 2026-07-26 against the installed
 * `@mcpjam/cli` 3.15.2 (resolving `@mcpjam/sdk` 2.0.1): a failing suite
 * exits 1 while still writing the full json-summary document to stdout
 * (observed on the protocol, oauth, and apps suites against the deployed
 * alpha); the `--conformance-checks` OAuth negative probes are gated on a
 * fully-successful ATTENDED main flow and cannot run headless against a
 * consent-requiring server. The wrapper never reads exit codes 0 or 1 as a
 * verdict — those are the vendor's operational normal (a failing suite
 * exits 1 while still writing the full report), and verdicts come from
 * parse + baseline comparison only. An exit outside 0 and 1 is the tool
 * itself failing (usage error, crash) and fails the suite as an
 * operational failure; the observed exit code is retained as report data
 * on every path.
 */
import { z } from 'zod';

/** The check/step statuses MCPJam's json-summary reporter emits. */
const mcpjamCaseStatusSchema = z.enum(['passed', 'failed', 'skipped']);

/**
 * One check (protocol/apps suites) or flow step (oauth suite) in a
 * json-summary report. `details` stays `unknown`: the wrapper never
 * consumes it, and pinning vendor-internal diagnostics would make the
 * boundary brittle for no verdict value.
 */
const mcpjamCaseSchema = z
  .object({
    id: z.string().min(1),
    title: z.string(),
    category: z.string(),
    status: mcpjamCaseStatusSchema,
    durationMs: z.number(),
    description: z.string().optional(),
    error: z.string().optional(),
    details: z.unknown().optional(),
    output: z.string().optional(),
  })
  .strict();

/** One suite group in a json-summary report. */
const mcpjamGroupSchema = z
  .object({
    id: z.string().min(1),
    title: z.string(),
    target: z.string().optional(),
    passed: z.boolean(),
    durationMs: z.number(),
    summary: z.string().optional(),
    cases: z.array(mcpjamCaseSchema),
  })
  .strict();

/**
 * The MCPJam `--reporter json-summary` document. `schemaVersion` is pinned
 * as a literal: a reporter schema bump must fail loudly at the parse
 * boundary, never half-match (strict validation at the boundary).
 */
export const mcpjamReportSchema = z
  .object({
    schemaVersion: z.literal(1),
    kind: z.string().min(1),
    name: z.string(),
    passed: z.boolean(),
    durationMs: z.number(),
    groups: z.array(mcpjamGroupSchema).min(1),
  })
  .strict()
  // EVERY group must carry a case, not merely some group. Comparison flattens
  // groups into an id-keyed case map and never reads `group.passed`, so a
  // group that failed at setup and emitted zero cases would vanish from the
  // verdict entirely — while the SAME group emitting even one case would fire
  // `novel-check` loudly. That asymmetry puts the hole in the drift tripwire
  // exactly where the vendor fails hardest, so an empty group fails here at
  // the parse boundary instead. Subsumes the zero-cases-everywhere case.
  .refine((report) => report.groups.every((group) => group.cases.length > 0), {
    message: 'every json-summary group must contain at least one check case',
  });

export type McpjamCase = z.infer<typeof mcpjamCaseSchema>;
export type McpjamReport = z.infer<typeof mcpjamReportSchema>;

/** The suites the wrapper can drive. */
export const conformanceSuiteSchema = z.enum(['protocol', 'apps', 'oauth']);
export type ConformanceSuite = z.infer<typeof conformanceSuiteSchema>;

/** Run mode: unattended (headless, no credentials) or attended/credentialed. */
export const conformanceModeSchema = z.enum(['unattended', 'attended']);
export type ConformanceMode = z.infer<typeof conformanceModeSchema>;

/**
 * The wrapper's two operations. `verdict` (default) compares each suite
 * against its committed baseline and validates every baseline UP FRONT —
 * a missing or unusable baseline fails in milliseconds with no network
 * contact. `seed` is capture-only: run live, retain raw reports verbatim
 * (the observation seed for authoring baselines), no comparison, pass iff
 * every capture succeeded.
 */
export type ConformanceOperation = 'verdict' | 'seed';

/**
 * Named divergence classes. Complete over the expected×observed status
 * matrix plus the set-membership and multiplicity drifts:
 *
 * - `unexpected-failure` — expected pass or skip, observed failed.
 * - `failure-shape-mismatch` — expected fail, observed fail, but the error
 *   text no longer contains the pinned `errorIncludes` fragment.
 * - `unexpected-pass` — expected fail, observed passed (a "healed" check is
 *   loud: e.g. the consent boundary suddenly passing headless would mean
 *   auto-consent appeared on the deployed surface).
 * - `new-skip` — expected pass or fail, observed skipped.
 * - `skip-reason-mismatch` — expected skip, observed skip, but the skip
 *   reason no longer contains the pinned `reasonIncludes` fragment (a
 *   broken-prerequisite skip masquerading as the baselined applicability
 *   skip).
 * - `vanished-skip` — expected skip, observed passed (the ticket's named
 *   drift: a skip silently becoming a pass is a baseline event, not a win).
 * - `missing-check` — in the baseline, absent from the run.
 * - `novel-check` — in the run, absent from the baseline (the
 *   version-drift tripwire that lets the dependency range float safely).
 * - `duplicate-check` — one check id observed more than once in a run:
 *   ambiguous verdict input under the floating range, surfaced loudly and
 *   never resolved last-wins.
 */
export interface Divergence {
  readonly kind:
    | 'unexpected-failure'
    | 'failure-shape-mismatch'
    | 'unexpected-pass'
    | 'new-skip'
    | 'skip-reason-mismatch'
    | 'vanished-skip'
    | 'missing-check'
    | 'novel-check'
    | 'duplicate-check';
  readonly checkId: string;
  readonly message: string;
}

/** Per-suite outcome in the wrapper's own report. */
export interface SuiteOutcome {
  readonly suite: ConformanceSuite;
  readonly verdict: 'pass' | 'fail';
  /**
   * Path of the retained raw mcpjam stdout: repo-root-relative when the
   * report dir was given (or defaulted) relative, verbatim when it was
   * given absolute. Absent when retention failed or never ran.
   */
  readonly rawReportPath?: string;
  /**
   * The child process exit code. 0 and 1 are the vendor's verdict-neutral
   * operational normal and never feed the verdict; any other code fails the
   * suite as an operational failure (module header, `operational-exit`).
   * Retained as report data on every path.
   */
  readonly mcpjamExitCode?: number;
  /**
   * Bounded excerpt of mcpjam's stderr when the run still produced a usable
   * report — a vendor deprecation or configuration warning emitted by a run
   * that otherwise passes. Report data, never a verdict input: it exists so
   * a clean verdict cannot silently sit on top of an unread warning.
   */
  readonly mcpjamStderr?: string;
  /**
   * Why this suite failed outside baseline comparison — one entry per
   * applicable failure class, NEVER joined into prose (a child stream can
   * contain any separator, so a joined string is lossy on arrival):
   * baseline unavailable/invalid, entry-validation abort, mcpjam launch
   * failure (bounded diagnostics of both streams ride the reason on
   * signal/timeout death, where retention cannot run), raw-stdout parse
   * failure (with a bounded stderr diagnostic when the child wrote one),
   * and raw-report retention failure. Simultaneous problems all appear.
   * Empty when the suite reached its operation's success bar.
   */
  readonly failureReasons: readonly string[];
  readonly divergences: readonly Divergence[];
  readonly baselineResidualMasking?: string;
}

/** The wrapper's aggregate report: `{ report, exitCode }` per house shape. */
export interface ConformanceRunReport {
  readonly schema_version: '1.0.0';
  readonly operation: ConformanceOperation;
  readonly target: string;
  readonly mode: ConformanceMode;
  readonly suites: readonly SuiteOutcome[];
  readonly verdict: 'pass' | 'fail';
}

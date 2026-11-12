/**
 * The committed-baseline schema family for `agent-tools mcp-conformance`
 * (MCP-189): the expected-check discriminated union and the baseline
 * document schema. Split from `types.ts` (which keeps the vendor report
 * schemas and the wrapper's own output shapes) so each boundary concern
 * stays one readable module.
 */
import { typeSafeKeys } from '../core/type-helpers.js';
import { z } from 'zod';

import { conformanceModeSchema, conformanceSuiteSchema } from './types.js';

/**
 * Expected terminal state for one check id. `errorIncludes` is required
 * exactly when a failure is expected — an expected failure without a pinned
 * shape would let any failure pass, which is exactly the masking that the
 * ticket's "named verdicts" bar exists to prevent. `reasonIncludes` is the
 * skip arm's twin: an expected skip without a pinned reason would let a
 * broken-prerequisite skip read as the applicability skip that was
 * baselined — the same masking, on the skip axis.
 */
// Trimmed-non-empty, not just non-empty: `" "` pins no shape, and
// `observed.includes(" ")` matches nearly any message — the same masking a
// missing fragment would cause, one space wide.
const pinnedFragment = (label: string) =>
  z.string().refine((fragment) => fragment.trim().length > 0, {
    message: `${label} must contain a non-whitespace fragment`,
  });

const expectedCheckSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('pass') }).strict(),
  z
    .object({
      status: z.literal('skip'),
      reasonIncludes: pinnedFragment('reasonIncludes'),
    })
    .strict(),
  z
    .object({
      status: z.literal('fail'),
      errorIncludes: pinnedFragment('errorIncludes'),
    })
    .strict(),
]);

/**
 * A committed baseline: the exact expected outcome of one (suite, mode)
 * run. Self-describing so a future drift adjudication can see what the
 * baseline was true OF: the baseline format version, the mcpjam version
 * and date observed at seeding, and any named residual masking window the
 * expectations cannot close (with its cover). Baselines are
 * target-agnostic — they never embed a deployment URL, and comparison
 * ignores environment-varying report fields (`target`, durations).
 */
export const baselineSchema = z
  .object({
    schema_version: z.literal('1.0.0'),
    suite: conformanceSuiteSchema,
    mode: conformanceModeSchema,
    seeded: z
      .object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
        mcpjam_version: z.string().min(1),
      })
      .strict(),
    residual_masking: z.string().optional(),
    // partialRecord: statically Partial<Record<...>> — most check-id strings
    // are NOT keys, and the comparator's absent-key guard must be justified
    // by the type, not merely tolerated. Runtime-identical to z.record for a
    // non-enum key (verified against the pinned zod 4.4.x source). The
    // refine rejects an EMPTY expectation set: it has no verdict semantics,
    // and paired with an empty run it would pass vacuously.
    expected: z
      .partialRecord(z.string().min(1), expectedCheckSchema)
      .refine((expected) => typeSafeKeys(expected).length > 0, {
        message: 'a baseline must pin at least one expected check',
      }),
  })
  .strict();

export type ExpectedCheck = z.infer<typeof expectedCheckSchema>;
export type Baseline = z.infer<typeof baselineSchema>;

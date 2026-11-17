/**
 * Integration tests for the anchored get-thread-progressions tool (G3 c2).
 *
 * @remarks
 *
 * These tests describe the TOOL ENVELOPE: input parsing at the MCP boundary
 * (exactly one anchor mode per call — `threadSlug` detail, or
 * `subject`+`keyStage` discovery), dispatch to the thread-progressions view,
 * and the response shape (summary TextContent + serialised JSON TextContent +
 * structuredContent). The retrieval semantics themselves — year ordering,
 * descriptor shape, anchor resolution — are specified by the view's own tests
 * in `@oaknational/graph-corpus-sdk` and are not re-specified here.
 *
 * Anchor fixtures are chosen deterministically from the corpus so the tests
 * describe behaviour over any valid corpus rather than pinning content.
 */

import { createCurriculumGraphViews } from '@oaknational/graph-corpus-sdk/curriculum';
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { fixtureCorpus } from '../../../graph-corpus-sdk/src/curriculum/__tests__/fixture-corpus.js';
import {
  GET_THREAD_PROGRESSIONS_TOOL_DEF,
  GET_THREAD_PROGRESSIONS_INPUT_SCHEMA,
  runThreadProgressionsTool,
} from './aggregated-thread-progressions.js';
import { wireProperties } from './test-helpers/advertised-examples.js';

const views = createCurriculumGraphViews(fixtureCorpus);

/** Narrows a deterministic fixture pick, failing loudly if the corpus cannot supply it. */
function required<T>(value: T | undefined, message: string): T {
  if (value === undefined) {
    throw new Error(message);
  }
  return value;
}

const bareSlug = (id: string): string => id.slice(id.indexOf(':') + 1);

/** A thread slug carrying at least one placement (lexicographic minimum sequence). */
const knownThreadSlug = bareSlug(
  required(
    fixtureCorpus.sequences.filter((sequence) => sequence.placements.length > 0)[0]?.threadId,
    'corpus has no non-empty sequence to anchor the tool tests',
  ),
);

/** A (subject, keyStage) pair known to exist on a sequenced unit. */
const knownSubjectKeyStage = required(
  (() => {
    const placedUnitIds = new Set(
      fixtureCorpus.sequences.flatMap((sequence) =>
        sequence.placements.map((placement) => placement.unitId),
      ),
    );
    const unit = fixtureCorpus.nodes.find(
      (node) => node.kind === 'unit' && placedUnitIds.has(node.id),
    );
    return unit?.kind === 'unit' ? { subject: unit.subject, keyStage: unit.keyStage } : undefined;
  })(),
  'corpus has no sequenced unit to derive a subject+keyStage anchor',
);

/** A thread the corpus runs through more than one subject, chosen deterministically. */
const multiSubjectThreadSlug = required(
  (() => {
    const counts = new Map<string, number>();
    for (const sequence of fixtureCorpus.sequences) {
      counts.set(sequence.threadId, (counts.get(sequence.threadId) ?? 0) + 1);
    }
    const found = [...counts.entries()]
      .filter(([, count]) => count > 1)
      .sort(([a], [b]) => a.localeCompare(b))[0];
    return found ? bareSlug(found[0]) : undefined;
  })(),
  'corpus has no thread spanning several subjects',
);

/** A thread confined to one subject, chosen deterministically. */
const singleSubjectThreadSlug = required(
  (() => {
    const counts = new Map<string, number>();
    for (const sequence of fixtureCorpus.sequences) {
      counts.set(sequence.threadId, (counts.get(sequence.threadId) ?? 0) + 1);
    }
    const found = [...counts.entries()]
      .filter(([, count]) => count === 1)
      .sort(([a], [b]) => a.localeCompare(b))[0];
    return found ? bareSlug(found[0]) : undefined;
  })(),
  'corpus has no single-subject thread',
);

const TEXT_CONTENT = z.object({ type: z.literal('text'), text: z.string() });

/** Non-strict envelope narrowing per anchor kind (the family envelope adds summary/status fields). */
const THREAD_ENVELOPE = z.object({
  anchorKind: z.literal('thread'),
  threads: z.array(
    z.object({
      thread: z.unknown(),
      totalUnits: z.number(),
      progressions: z.array(
        z.object({
          subject: z.string(),
          totalUnits: z.number(),
          entries: z.array(z.object({ unit: z.unknown(), year: z.number().optional() })),
        }),
      ),
    }),
  ),
  resolvedAnchors: z.array(z.string()),
  unknownAnchors: z.array(z.string()),
});

const DISCOVERY_ENVELOPE = z.object({
  anchorKind: z.literal('subjectKeyStage'),
  subject: z.string(),
  keyStage: z.string(),
  threads: z.array(
    z.object({ thread: z.unknown(), totalUnits: z.number(), subjects: z.array(z.string()) }),
  ),
});

describe('GET_THREAD_PROGRESSIONS_TOOL_DEF', () => {
  it('describes the anchored bounded contract, not a whole-corpus dump', () => {
    expect(GET_THREAD_PROGRESSIONS_TOOL_DEF.description).toContain('anchor');
    expect(GET_THREAD_PROGRESSIONS_TOOL_DEF.description).toContain('threadSlug');
    expect(GET_THREAD_PROGRESSIONS_TOOL_DEF.description).toContain('subject + keyStage');
    expect(GET_THREAD_PROGRESSIONS_TOOL_DEF.description).not.toContain('complete static graph');
  });

  it('states the curriculum-order semantics: per-subject runs, never a cross-subject interleave', () => {
    expect(GET_THREAD_PROGRESSIONS_TOOL_DEF.description).toContain('curriculum order');
    expect(GET_THREAD_PROGRESSIONS_TOOL_DEF.description).toContain('one run per subject');
    expect(GET_THREAD_PROGRESSIONS_TOOL_DEF.description).toContain('never interleaved');
    expect(GET_THREAD_PROGRESSIONS_TOOL_DEF.description).not.toContain('not curricular');
  });

  it('is read-only, idempotent, and closed-world', () => {
    expect(GET_THREAD_PROGRESSIONS_TOOL_DEF.annotations).toEqual({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
      title: GET_THREAD_PROGRESSIONS_TOOL_DEF.title,
    });
  });
});

describe('runThreadProgressionsTool — anchor exclusivity at the boundary', () => {
  it('rejects a call with no anchor', () => {
    const result = runThreadProgressionsTool({}, views);

    expect(result.isError).toBe(true);
  });

  it('rejects combining threadSlug with the discovery anchor', () => {
    const result = runThreadProgressionsTool(
      {
        threadSlug: knownThreadSlug,
        subject: knownSubjectKeyStage.subject,
        keyStage: knownSubjectKeyStage.keyStage,
      },
      views,
    );

    expect(result.isError).toBe(true);
  });

  it('rejects a discovery anchor missing its other half', () => {
    const result = runThreadProgressionsTool({ subject: knownSubjectKeyStage.subject }, views);

    expect(result.isError).toBe(true);
  });
});

describe('runThreadProgressionsTool — thread detail anchor', () => {
  it('returns one thread’s progression in structuredContent with paired TextContent', () => {
    const result = runThreadProgressionsTool({ threadSlug: knownThreadSlug }, views);

    expect(result.isError).toBeUndefined();
    expect(result.content).toHaveLength(2);
    for (const block of result.content) {
      expect(TEXT_CONTENT.safeParse(block).success).toBe(true);
    }

    const envelope = THREAD_ENVELOPE.parse(result.structuredContent);
    expect(envelope.threads).toHaveLength(1);
    expect(envelope.resolvedAnchors).toEqual([`thread:${knownThreadSlug}`]);
    expect(envelope.threads[0]?.progressions.length).toBeGreaterThan(0);
    expect(envelope.threads[0]?.progressions[0]?.entries.length).toBeGreaterThan(0);
  });

  it('returns exactly one run for a thread confined to a single subject', () => {
    const result = runThreadProgressionsTool({ threadSlug: singleSubjectThreadSlug }, views);

    const envelope = THREAD_ENVELOPE.parse(result.structuredContent);
    expect(envelope.threads[0]?.progressions).toHaveLength(1);
  });

  it('returns one run per subject for a thread spanning several subjects', () => {
    const expectedRuns = fixtureCorpus.sequences.filter(
      (sequence) => sequence.threadId === `thread:${multiSubjectThreadSlug}`,
    ).length;
    const result = runThreadProgressionsTool({ threadSlug: multiSubjectThreadSlug }, views);

    const envelope = THREAD_ENVELOPE.parse(result.structuredContent);
    expect(expectedRuns).toBeGreaterThan(1);
    expect(envelope.threads[0]?.progressions).toHaveLength(expectedRuns);
  });

  // The summary is content[0] — the only block a text-only host renders — so
  // the per-subject shape and the ordering basis must survive in prose, not
  // only in structuredContent.
  it('states the run count, the subjects, and the ordering basis in the summary text', () => {
    const result = runThreadProgressionsTool({ threadSlug: multiSubjectThreadSlug }, views);
    const summary = result.content[0];
    const subjects = fixtureCorpus.sequences
      .filter((sequence) => sequence.threadId === `thread:${multiSubjectThreadSlug}`)
      .map((sequence) => sequence.subject);

    const text = TEXT_CONTENT.parse(summary).text;
    expect(text).toContain(`${String(subjects.length)} subject runs`);
    expect(text).toContain('curriculum order');
    for (const subject of subjects) {
      expect(text).toContain(subject);
    }
  });

  it('says "subject run" in the singular for a single-subject thread', () => {
    const result = runThreadProgressionsTool({ threadSlug: singleSubjectThreadSlug }, views);

    const text = TEXT_CONTENT.parse(result.content[0]).text;
    expect(text).toContain('1 subject run (');
  });

  it('reports an unknown thread slug without erroring (well-formed empty)', () => {
    const result = runThreadProgressionsTool({ threadSlug: 'no-such-thread' }, views);

    expect(result.isError).toBeUndefined();
    const envelope = THREAD_ENVELOPE.parse(result.structuredContent);
    expect(envelope.threads).toEqual([]);
    expect(envelope.unknownAnchors).toEqual(['no-such-thread']);
  });
});

describe('runThreadProgressionsTool — subject+keyStage discovery anchor', () => {
  it('returns bounded descriptors without sequences', () => {
    const result = runThreadProgressionsTool(knownSubjectKeyStage, views);

    expect(result.isError).toBeUndefined();
    const envelope = DISCOVERY_ENVELOPE.parse(result.structuredContent);
    expect(envelope.threads.length).toBeGreaterThan(0);
    expect(envelope.threads.length).toBeLessThan(fixtureCorpus.sequences.length);
    expect(envelope.threads[0]).not.toHaveProperty('progressions');
  });

  it('returns a well-formed empty result for an unmatched anchor', () => {
    const result = runThreadProgressionsTool(
      { subject: 'no-such-subject', keyStage: 'ks2' },
      views,
    );

    expect(result.isError).toBeUndefined();
    const envelope = DISCOVERY_ENVELOPE.parse(result.structuredContent);
    expect(envelope.threads).toEqual([]);
  });
});

describe('advertised examples on the wire schema', () => {
  const shape = GET_THREAD_PROGRESSIONS_INPUT_SCHEMA;

  it('advertises every example on the wire JSON Schema', () => {
    const properties = wireProperties(shape);
    const advertising = Object.entries(shape).filter(([, s]) => s.meta()?.examples !== undefined);
    expect(advertising, 'shape advertises no examples at all').not.toHaveLength(0);
    for (const [field, schema] of Object.entries(shape)) {
      expect(properties[field]?.examples, `${field} examples on the wire`).toEqual(
        schema.meta()?.examples,
      );
    }
  });
});

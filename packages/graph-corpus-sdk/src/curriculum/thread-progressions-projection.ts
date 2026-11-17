/**
 * Thread-progressions projection (G3 c1) — the index over the
 * per-subject, curriculum-ordered thread→unit sequences of the one
 * curriculum graph corpus.
 *
 * Sequence order is its own corpus section (`sequences`) because ordering
 * cannot ride the attribute-less `{source, type, target}` edges — this is the
 * ordered projection over the one-graph corpus data, its own real operation
 * (ADR-173 real-operations-only). A thread is a tag; each sequence is the
 * thread's units within ONE subject in that subject's curriculum order
 * (years ascending across the primary and secondary phases, Oak's authored
 * unit order within a year). A thread spanning several subjects carries one
 * sequence per subject, never an interleaved chain, so the index maps a
 * thread to its sequences.
 *
 * This module builds the thread and unit node indexes plus the per-thread
 * sequence map from a corpus value — per-view selection over the corpus, the
 * settled substrate mechanism (the EEF and G2 precedent).
 */

import type {
  GraphCorpusNodeId,
  GraphCorpusSequence,
  GraphCorpusThreadNode,
  GraphCorpusThreadNodeId,
  GraphCorpusUnitNode,
} from '@oaknational/sdk-codegen/graph-corpus';

import { mustGet, type CurriculumGraphCorpus } from './projection-helpers.js';

/** The thread-progressions projection: thread/unit node indexes plus the per-thread sequence map. */
export interface CurriculumThreadProgressionsProjection {
  readonly threadsById: ReadonlyMap<GraphCorpusNodeId, GraphCorpusThreadNode>;
  readonly unitsById: ReadonlyMap<GraphCorpusNodeId, GraphCorpusUnitNode>;
  /** Each thread's sequences, one per subject, in the corpus's subject-sorted emission order. */
  readonly sequencesByThreadId: ReadonlyMap<
    GraphCorpusThreadNodeId,
    readonly GraphCorpusSequence[]
  >;
}

/**
 * Builds the thread-progressions projection over a graph corpus:
 * thread and unit node indexes plus the per-thread sequence map (one
 * sequence per subject the thread spans). Every sequence endpoint is
 * integrity-checked against the node indexes at build (the corpus's
 * zero-dangling invariant, enforced loudly).
 */
export function buildCurriculumThreadProgressionsProjection(
  corpus: CurriculumGraphCorpus,
): CurriculumThreadProgressionsProjection {
  const threadsById = new Map<GraphCorpusNodeId, GraphCorpusThreadNode>();
  const unitsById = new Map<GraphCorpusNodeId, GraphCorpusUnitNode>();
  for (const node of corpus.nodes) {
    if (node.kind === 'thread') {
      threadsById.set(node.id, node);
    } else if (node.kind === 'unit') {
      unitsById.set(node.id, node);
    }
  }

  const sequencesByThreadId = new Map<GraphCorpusThreadNodeId, GraphCorpusSequence[]>();
  for (const sequence of corpus.sequences) {
    mustGet(threadsById, sequence.threadId);
    for (const placement of sequence.placements) {
      mustGet(unitsById, placement.unitId);
    }
    const existing = sequencesByThreadId.get(sequence.threadId);
    if (existing === undefined) {
      sequencesByThreadId.set(sequence.threadId, [sequence]);
    } else {
      existing.push(sequence);
    }
  }

  return { threadsById, unitsById, sequencesByThreadId };
}

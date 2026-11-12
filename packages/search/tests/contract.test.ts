import type { Client } from '@elastic/elasticsearch';
import { describe, expect, it } from 'vitest';

import type {
  SearchRetrievalError,
  SearchRetrievalService,
} from '../../curriculum-sdk/src/mcp/search-retrieval-types.js';
import { createSearchRetrieval } from '../src/create-search-retrieval.js';
import { createSearchSdk } from '../src/create-search-sdk.js';

interface RecordedHit {
  readonly _index: string;
  readonly _id: string;
  readonly _score: number;
  readonly _source: Record<string, unknown>;
}

function hit(
  index: string,
  id: string,
  score: number,
  source: Record<string, unknown>,
): RecordedHit {
  return { _index: index, _id: id, _score: score, _source: source };
}

function hitsResponse(hits: readonly RecordedHit[]): unknown {
  return {
    took: 3,
    timed_out: false,
    hits: {
      total: { value: hits.length, relation: 'eq' },
      max_score: hits[0]?._score ?? null,
      hits,
    },
  };
}

const RECORDED: Readonly<Record<string, unknown>> = {
  oak_lessons: hitsResponse([
    hit('oak_lessons', 'photosynthesis-ks3', 0.05, {
      lesson_slug: 'photosynthesis-ks3',
      lesson_title: 'Photosynthesis',
      subject_slug: 'science',
      key_stage: 'ks3',
    }),
    hit('oak_lessons', 'plant-cells', 0.03, {
      lesson_slug: 'plant-cells',
      lesson_title: 'Plant cells',
      subject_slug: 'science',
      key_stage: 'ks3',
    }),
  ]),
  oak_unit_rollup: hitsResponse([
    hit('oak_unit_rollup', 'fractions-year-7', 0.04, {
      unit_slug: 'fractions-year-7',
      unit_title: 'Fractions',
      subject_slug: 'maths',
      key_stage: 'ks3',
    }),
  ]),
  oak_sequences: hitsResponse([
    hit('oak_sequences', 'maths-secondary', 0.04, {
      sequence_slug: 'maths-secondary',
      sequence_title: 'Maths secondary',
      subject_slug: 'maths',
    }),
  ]),
  oak_threads: hitsResponse([
    hit('oak_threads', 'number', 0.04, {
      thread_slug: 'number',
      thread_title: 'Number',
      subject_slugs: ['maths'],
    }),
  ]),
  oak_sequence_facets: hitsResponse([
    hit('oak_sequence_facets', 'maths-secondary-ks3', 1, {
      subject_slug: 'maths',
      sequence_slug: 'maths-secondary',
      key_stages: ['ks3'],
      key_stage_title: 'Key Stage 3',
      phase_slug: 'secondary',
      phase_title: 'Secondary',
      years: ['7', '8', '9'],
      unit_slugs: ['fractions-year-7'],
      unit_titles: ['Fractions'],
      unit_count: 1,
      lesson_count: 12,
      has_ks4_options: false,
      sequence_canonical_url: 'https://www.thenational.academy/teachers/curriculum/maths-secondary',
    }),
  ]),
};

const COMPLETION = {
  took: 1,
  timed_out: false,
  hits: { total: { value: 0, relation: 'eq' }, max_score: null, hits: [] },
  suggest: {
    suggestions: [{ options: [{ text: 'Fractions' }, { text: 'Fractions of amounts' }] }],
  },
};

function recordedClient(): { client: Client; indices: string[] } {
  const indices: string[] = [];
  const fake = {
    search: (request: { index?: string; suggest?: unknown }): Promise<unknown> => {
      const index = request.index ?? '';
      indices.push(index);
      if (request.suggest !== undefined) {
        return Promise.resolve(COMPLETION);
      }
      const body = RECORDED[index];
      return body === undefined
        ? Promise.reject(new Error(`no recorded response for ${index}`))
        : Promise.resolve(body);
    },
  };
  return { client: fake as unknown as Client, indices };
}

function adapter(client: Client): SearchRetrievalService {
  return createSearchSdk({ deps: { esClient: client }, config: { indexTarget: 'primary' } })
    .retrieval;
}

describe('the search SDK adapter behind SearchRetrievalService', () => {
  it('searchLessons returns the recorded lesson hits in rank order', async () => {
    const result = await adapter(recordedClient().client).searchLessons({
      query: 'photosynthesis',
      keyStage: 'ks3',
    });
    expect(result.ok && result.value.scope).toBe('lessons');
    expect(result.ok && result.value.results.map((r) => r.id)).toEqual([
      'photosynthesis-ks3',
      'plant-cells',
    ]);
  });

  it('searchUnits reads the unit rollup index', async () => {
    const { client, indices } = recordedClient();
    const result = await adapter(client).searchUnits({ query: 'fractions', subject: 'maths' });
    expect(indices).toEqual(['oak_unit_rollup']);
    expect(result.ok && result.value.results.map((r) => r.id)).toEqual(['fractions-year-7']);
  });

  it('searchSequences returns the recorded sequence hits', async () => {
    const result = await adapter(recordedClient().client).searchSequences({ query: 'maths' });
    expect(result.ok && result.value.results.map((r) => r.sequence.sequence_slug)).toEqual([
      'maths-secondary',
    ]);
  });

  it('searchThreads returns the recorded thread hits', async () => {
    const result = await adapter(recordedClient().client).searchThreads({ query: 'number' });
    expect(result.ok && result.value.results.map((r) => r.thread.thread_slug)).toEqual(['number']);
  });

  it('suggest returns the completion suggestions first', async () => {
    const result = await adapter(recordedClient().client).suggest({
      prefix: 'fract',
      scope: 'lessons',
      subject: 'maths',
    });
    expect(result.ok && result.value.suggestions.slice(0, 2).map((s) => s.label)).toEqual([
      'Fractions',
      'Fractions of amounts',
    ]);
  });

  it('fetchSequenceFacets maps the recorded facet documents', async () => {
    const result = await adapter(recordedClient().client).fetchSequenceFacets({ subject: 'maths' });
    expect(result.ok && result.value.sequences).toEqual([
      expect.objectContaining({
        sequenceSlug: 'maths-secondary',
        keyStage: 'ks3',
        units: [{ unitSlug: 'fractions-year-7', unitTitle: 'Fractions' }],
      }),
    ]);
  });

  it('returns a typed error from every method, without throwing, when Elasticsearch is unreachable', async () => {
    const service: SearchRetrievalService = createSearchRetrieval({
      ELASTICSEARCH_URL: 'http://127.0.0.1:9',
      ELASTICSEARCH_API_KEY: 'unused',
    });
    const results = await Promise.all([
      service.searchLessons({ query: 'photosynthesis' }),
      service.searchUnits({ query: 'fractions' }),
      service.searchSequences({ query: 'maths' }),
      service.searchThreads({ query: 'number' }),
      service.suggest({ prefix: 'fract', scope: 'lessons', subject: 'maths' }),
      service.fetchSequenceFacets(),
    ]);
    const errorTypes: SearchRetrievalError['type'][] = ['es_error', 'timeout', 'unknown'];
    for (const result of results) {
      expect(result.ok).toBe(false);
      expect(errorTypes).toContain(result.ok ? undefined : result.error.type);
    }
  }, 30_000);
});

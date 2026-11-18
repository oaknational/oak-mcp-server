/**
 * Integration tests for createUniversalToolExecutor.
 *
 * Tests how the executor dispatches calls to search, fetch, ontology,
 * and generated MCP tools. Uses vi.fn() mocks injected via DI — making
 * these integration tests per the testing strategy.
 */

import { describe, it, expect, vi } from 'vitest';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types';
import type { ToolName } from '@oaknational/sdk-codegen/mcp-tools';
import { z } from 'zod';
import { McpToolError } from './execute-tool-call.js';
import { err, ok } from '@oaknational/result';
import type { Logger } from '@oaknational/logger';
import {
  createCurriculumGraphViews,
  type CurriculumGraphViews,
} from '@oaknational/graph-corpus-sdk/curriculum';
import type { CurriculumGraphResult } from '@oaknational/graph-corpus-sdk/load';
import { fixtureCorpus } from '../../../graph-corpus-sdk/src/curriculum/__tests__/fixture-corpus.js';
import { createUniversalToolExecutor } from './universal-tools/executor.js';
import type {
  GeneratedToolRegistry,
  ToolRegistryDescriptor,
  UniversalToolName,
} from './universal-tools/types.js';
import { createStubSearchRetrieval } from './search-retrieval-stub.js';

const sampleMcpToolName = 'get-key-stages-subject-lessons' as const satisfies ToolName;

const sampleDescriptor: ToolRegistryDescriptor = {
  description: 'List lessons for a subject',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      params: {
        type: 'object',
        additionalProperties: false,
        properties: {
          path: {
            type: 'object',
            additionalProperties: false,
            properties: {
              keyStage: { type: 'string' },
              subject: { type: 'string' },
            },
          },
        },
      },
    },
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
    title: 'Get Lessons',
  },
  securitySchemes: [],
  _meta: { securitySchemes: [] },
  toolMcpFlatInputSchema: z.object({
    params: z.object({
      path: z.object({
        keyStage: z.string(),
        subject: z.string(),
      }),
    }),
  }),
};

function createFakeRegistry(
  descriptor: ToolRegistryDescriptor = sampleDescriptor,
): GeneratedToolRegistry {
  return {
    toolNames: [sampleMcpToolName],
    getToolFromToolName: () => descriptor,
    isToolName: (value: unknown): value is ToolName =>
      typeof value === 'string' && value === sampleMcpToolName,
  };
}

type StructuredContent = NonNullable<CallToolResult['structuredContent']>;

function assertIsStructuredContent(value: unknown): asserts value is StructuredContent {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Expected object payload');
  }
}

function parseTextContent(result: CallToolResult): StructuredContent {
  const jsonContent = result.content.length >= 2 ? result.content[1] : result.content[0];
  if (jsonContent.type !== 'text') {
    throw new Error(`Expected text content but received ${jsonContent.type}`);
  }
  const parsed: unknown = JSON.parse(jsonContent.text);
  assertIsStructuredContent(parsed);
  return parsed;
}

const registry = createFakeRegistry();

type GraphLoadErrorKind = 'not-found' | 'read-failed' | 'invalid-snapshot';

function graphUnavailable(kind: GraphLoadErrorKind): () => Promise<CurriculumGraphResult> {
  return () =>
    Promise.resolve(err({ kind, message: `graph-corpus/v1/latest.json: ${kind} detail` }));
}

function createFakeLogger(): { readonly logger: Logger; readonly error: ReturnType<typeof vi.fn> } {
  const error = vi.fn();
  const logger: Logger = {
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error,
    fatal: vi.fn(),
  };
  return { logger, error };
}

const SAMPLE_MCP_TOOL_NAME: UniversalToolName = sampleMcpToolName;

describe('createUniversalToolExecutor', () => {
  it('dispatches search to searchRetrieval service', async () => {
    const executeMcpTool = vi.fn();
    const searchRetrieval = {
      ...createStubSearchRetrieval(),
      searchLessons: vi.fn().mockResolvedValue(
        ok({
          scope: 'lessons',
          total: 1,
          took: 5,
          timedOut: false,
          results: [{ title: 'Photosynthesis' }],
        }),
      ),
    };
    const callUniversalTool = createUniversalToolExecutor({
      executeMcpTool,
      searchRetrieval,
      generatedTools: registry,
      loadCurriculumGraph: graphUnavailable('not-found'),
    });

    const result = await callUniversalTool('search', {
      query: 'photosynthesis',
      scope: 'lessons',
    });

    expect(searchRetrieval.searchLessons).toHaveBeenCalled();
    expect(executeMcpTool).not.toHaveBeenCalled();
    expect(result.isError).toBeUndefined();

    const firstContent = result.content[0];
    expect(firstContent.type).toBe('text');
    if ('text' in firstContent) {
      expect(firstContent.text).toContain('photosynthesis');
    }

    expect(result.structuredContent).toBeDefined();
    expect(result.structuredContent).toHaveProperty('scope', 'lessons');
    expect(result.structuredContent).toHaveProperty('total', 1);
    expect(result.structuredContent).toHaveProperty('results');

    expect(result._meta).toBeDefined();
    expect(result._meta).toHaveProperty('query', 'photosynthesis');
  });

  it('aggregates fetch results using the MCP executor', async () => {
    const executeMcpTool = vi.fn().mockImplementation((name: string) => {
      if (name === 'get-lessons-summary') {
        return Promise.resolve(ok({ status: 200, data: { lesson: { id: 'lesson-slug' } } }));
      }
      return Promise.resolve(ok({ status: 200, data: null }));
    });
    const callUniversalTool = createUniversalToolExecutor({
      executeMcpTool,
      searchRetrieval: createStubSearchRetrieval(),
      generatedTools: registry,
      loadCurriculumGraph: graphUnavailable('not-found'),
    });

    const result = await callUniversalTool('fetch', { id: 'lesson:maths-lesson' });

    expect(executeMcpTool).toHaveBeenCalledWith('get-lessons-summary', {
      lesson: 'maths-lesson',
    });
    expect(result.isError).toBeUndefined();

    const firstContent = result.content[0];
    expect(firstContent.type).toBe('text');
    if ('text' in firstContent) {
      expect(firstContent.text).toContain('lesson');
    }

    expect(result.structuredContent).toBeDefined();
    expect(result.structuredContent).toHaveProperty('id', 'lesson:maths-lesson');
    expect(result.structuredContent).toHaveProperty('type', 'lesson');
  });

  it('delegates curriculum tools directly to the MCP executor', async () => {
    const executeMcpTool = vi.fn().mockResolvedValue(ok({ status: 200, data: { status: 'ok' } }));
    const callUniversalTool = createUniversalToolExecutor({
      executeMcpTool,
      searchRetrieval: createStubSearchRetrieval(),
      generatedTools: registry,
      loadCurriculumGraph: graphUnavailable('not-found'),
    });

    const args = {
      params: {
        path: { keyStage: 'ks3', subject: 'science' },
      },
    };
    const result = await callUniversalTool(SAMPLE_MCP_TOOL_NAME, args);

    expect(executeMcpTool).toHaveBeenCalledWith(SAMPLE_MCP_TOOL_NAME, args);
    const payload = parseTextContent(result);
    expect(payload).toEqual({ status: 200, data: { status: 'ok' } });
  });

  it('surfaces the pagination echo of a paginated tool result to the agent', async () => {
    const executeMcpTool = vi.fn().mockResolvedValue(
      ok({
        status: 200,
        data: [{ lessonSlug: 'lesson-one' }],
        pagination: { hasMore: true, nextOffset: 20, nextLimit: 20 },
      }),
    );
    const callUniversalTool = createUniversalToolExecutor({
      executeMcpTool,
      searchRetrieval: createStubSearchRetrieval(),
      generatedTools: registry,
      loadCurriculumGraph: graphUnavailable('not-found'),
    });

    const result = await callUniversalTool(SAMPLE_MCP_TOOL_NAME, {});

    const payload = parseTextContent(result);
    expect(payload).toEqual({
      status: 200,
      data: [{ lessonSlug: 'lesson-one' }],
      pagination: { hasMore: true, nextOffset: 20, nextLimit: 20 },
    });
    expect(result.structuredContent).toMatchObject({
      pagination: { hasMore: true, nextOffset: 20, nextLimit: 20 },
    });
  });

  it('keeps non-paginated tool results free of a pagination field', async () => {
    const executeMcpTool = vi.fn().mockResolvedValue(ok({ status: 200, data: { status: 'ok' } }));
    const callUniversalTool = createUniversalToolExecutor({
      executeMcpTool,
      searchRetrieval: createStubSearchRetrieval(),
      generatedTools: registry,
      loadCurriculumGraph: graphUnavailable('not-found'),
    });

    const result = await callUniversalTool(SAMPLE_MCP_TOOL_NAME, {});

    const payload = parseTextContent(result);
    expect(payload).not.toHaveProperty('pagination');
    expect(result.structuredContent).not.toHaveProperty('pagination');
  });

  it('uses the shared title-resolution rule for summaries and widget metadata', async () => {
    const annotations = sampleDescriptor.annotations;

    expect(annotations).toBeDefined();
    if (!annotations) {
      throw new Error('Expected generated tool descriptor to include annotations');
    }

    const { title, ...annotationsWithoutTitle } = annotations;
    expect(title).toBeDefined();
    const registryWithTopLevelTitle = createFakeRegistry({
      ...sampleDescriptor,
      title: 'Spec-aligned top-level title',
      annotations: annotationsWithoutTitle,
    });
    const executeMcpTool = vi.fn().mockResolvedValue(ok({ status: 200, data: { status: 'ok' } }));
    const callUniversalTool = createUniversalToolExecutor({
      executeMcpTool,
      searchRetrieval: createStubSearchRetrieval(),
      generatedTools: registryWithTopLevelTitle,
      loadCurriculumGraph: graphUnavailable('not-found'),
    });

    const result = await callUniversalTool(SAMPLE_MCP_TOOL_NAME, {});

    expect(result.content[0]).toEqual({
      type: 'text',
      text: 'Spec-aligned top-level title: 200',
    });
    expect(result._meta).toHaveProperty('annotations/title', 'Spec-aligned top-level title');
  });

  it('maps executor errors to CallToolResult', async () => {
    const executeMcpTool = vi
      .fn()
      .mockResolvedValue(err(new McpToolError('Execution failed', SAMPLE_MCP_TOOL_NAME)));
    const callUniversalTool = createUniversalToolExecutor({
      executeMcpTool,
      searchRetrieval: createStubSearchRetrieval(),
      generatedTools: registry,
      loadCurriculumGraph: graphUnavailable('not-found'),
    });

    const result = await callUniversalTool(SAMPLE_MCP_TOOL_NAME, {});

    expect(result.isError).toBe(true);
    expect(result.content[0]).toEqual({ type: 'text', text: 'Execution failed' });
  });
});

describe('createUniversalToolExecutor download-asset seam', () => {
  it('threads executeMcpTool into download-asset and refuses without minting when the lookup fails', async () => {
    const factoryCalls: string[] = [];
    const executeMcpTool = vi.fn().mockResolvedValue(
      err(
        new McpToolError('No lessons found', 'get-lessons-assets', {
          code: 'RESOURCE_NOT_FOUND',
        }),
      ),
    );
    const callUniversalTool = createUniversalToolExecutor({
      executeMcpTool,
      searchRetrieval: createStubSearchRetrieval(),
      generatedTools: registry,
      loadCurriculumGraph: graphUnavailable('not-found'),
      createAssetDownloadUrl: (lesson: string, type: string): string => {
        factoryCalls.push(`${lesson}/${type}`);
        return `https://example.com/${lesson}/${type}`;
      },
    });

    const result = await callUniversalTool('download-asset', {
      lesson: 'no-such-lesson',
      type: 'worksheet',
    });

    expect(executeMcpTool).toHaveBeenCalledWith('get-lessons-assets', { lesson: 'no-such-lesson' });
    expect(result.isError).toBe(true);
    expect(factoryCalls).toHaveLength(0);
  });
});

const GRAPH_TOOL_CALLS = [
  ['get-thread-progressions', { threadSlug: 'long-thread' }],
  ['get-prior-knowledge-graph', { unitSlugs: ['unit-b'] }],
  ['get-misconception-graph', { unitSlugs: ['unit-a'] }],
  ['get-keyword-graph', { subject: 'maths', keyStage: 'ks2' }],
] as const satisfies readonly (readonly [UniversalToolName, unknown])[];

describe('graph tools through the curriculum graph loader', () => {
  it.each(GRAPH_TOOL_CALLS)('%s answers from the loaded views', async (tool, args) => {
    const views = createCurriculumGraphViews(fixtureCorpus);
    const loadCurriculumGraph = vi.fn(() => Promise.resolve(ok(views)));
    const callUniversalTool = createUniversalToolExecutor({
      executeMcpTool: vi.fn(),
      searchRetrieval: createStubSearchRetrieval(),
      generatedTools: registry,
      loadCurriculumGraph,
    });

    const result = await callUniversalTool(tool, args);

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toBeDefined();
    expect(loadCurriculumGraph).toHaveBeenCalledTimes(1);
  });

  describe.each([
    ['not-found', 'retrying will not help'],
    ['read-failed', 'retry this call once'],
    ['invalid-snapshot', 'retrying will not help'],
  ] as const)('when the load fails with %s', (kind, retryAdvice) => {
    it.each(GRAPH_TOOL_CALLS)(
      '%s returns one text error naming the tool, the retry advice and the fallbacks',
      async (tool, args) => {
        const { logger, error } = createFakeLogger();
        const callUniversalTool = createUniversalToolExecutor({
          executeMcpTool: vi.fn(),
          searchRetrieval: createStubSearchRetrieval(),
          generatedTools: registry,
          loadCurriculumGraph: graphUnavailable(kind),
          logger,
        });

        const result = await callUniversalTool(tool, args);

        expect(result.isError).toBe(true);
        expect(result.structuredContent).toBeUndefined();
        expect(result.content).toHaveLength(1);
        const [content] = result.content;
        expect(content.type).toBe('text');
        const text = content.type === 'text' ? content.text : '';
        expect(text).toContain(tool);
        expect(text).toContain(retryAdvice);
        for (const fallback of ['search', 'fetch', 'browse-curriculum']) {
          expect(text).toContain(fallback);
        }
        expect(text).not.toContain(kind);
        expect(text).not.toContain('latest.json');
        expect(error).toHaveBeenCalledWith(
          'mcp-tool.curriculum-graph.unavailable',
          expect.objectContaining({ tool, kind }),
        );
      },
    );
  });

  it.each([
    ['get-thread-progressions', { threadSlug: '' }],
    ['get-prior-knowledge-graph', {}],
    ['get-misconception-graph', { unitSlugs: ['unit-a'], threadSlug: 'long-thread' }],
    ['get-keyword-graph', { subject: 'maths' }],
  ] as const satisfies readonly (readonly [UniversalToolName, unknown])[])(
    '%s reports invalid input without loading the graph',
    async (tool, args) => {
      const loadCurriculumGraph = vi.fn(graphUnavailable('not-found'));
      const callUniversalTool = createUniversalToolExecutor({
        executeMcpTool: vi.fn(),
        searchRetrieval: createStubSearchRetrieval(),
        generatedTools: registry,
        loadCurriculumGraph,
      });

      const result = await callUniversalTool(tool, args);

      expect(result.isError).toBe(true);
      const [content] = result.content;
      expect(content.type === 'text' ? content.text : '').toContain(`Invalid ${tool} input`);
      expect(loadCurriculumGraph).not.toHaveBeenCalled();
    },
  );

  it.each(GRAPH_TOOL_CALLS)(
    '%s returns a generic error and logs the exception when the views throw',
    async (tool, args) => {
      const internalDetail = 'mustGet integrity breach: unit-a missing from units';
      const throwing = (): never => {
        throw new Error(internalDetail);
      };
      const views: CurriculumGraphViews = {
        priorKnowledgeStatements: throwing,
        misconceptionsForLessons: throwing,
        misconceptionsForUnits: throwing,
        misconceptionsForThread: throwing,
        progressionForThread: throwing,
        progressionsForSubjectKeyStage: throwing,
        keywordsForSubjectKeyStage: throwing,
      };
      const { logger, error } = createFakeLogger();
      const callUniversalTool = createUniversalToolExecutor({
        executeMcpTool: vi.fn(),
        searchRetrieval: createStubSearchRetrieval(),
        generatedTools: registry,
        loadCurriculumGraph: () => Promise.resolve(ok(views)),
        logger,
      });

      const result = await callUniversalTool(tool, args);

      expect(result.isError).toBe(true);
      expect(result.content).toHaveLength(1);
      const [content] = result.content;
      const text = content.type === 'text' ? content.text : '';
      expect(text).toContain(tool);
      expect(text).not.toContain(internalDetail);
      expect(error).toHaveBeenCalledWith(
        'mcp-tool.curriculum-graph.failed',
        expect.objectContaining({ message: internalDetail }),
        expect.objectContaining({ tool }),
      );
    },
  );
});

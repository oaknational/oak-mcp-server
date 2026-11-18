/**
 * Universal tool executor for MCP tool invocations.
 *
 * This module provides the execution logic for both aggregated tools
 * (hand-written) and generated tools (from OpenAPI spec). It handles
 * validation, dispatch, and result formatting.
 */

import type { CallToolResult } from '@modelcontextprotocol/sdk/types';
import type { CurriculumGraphViews } from '@oaknational/graph-corpus-sdk/curriculum';
import type { GraphCorpusLoadError } from '@oaknational/graph-corpus-sdk/load';
import { normalizeError } from '@oaknational/logger';
import type { Result } from '@oaknational/result';
import type { ToolExecutionResult } from '../execute-tool-call.js';
import {
  formatToolResponse,
  formatError,
  formatUnknownTool,
  resolveUniversalToolLogger,
  toErrorMessage,
  type UniversalToolExecutorDependencies,
} from '../universal-tool-shared.js';
import { validateFetchArgs, runFetchTool } from '../aggregated-fetch/index.js';
import { runCurriculumModelTool } from '../aggregated-curriculum-model/index.js';
import {
  parseThreadProgressionsInput,
  runThreadProgressionsTool,
} from '../aggregated-thread-progressions.js';
import {
  parsePriorKnowledgeGraphInput,
  runPriorKnowledgeGraphTool,
} from '../aggregated-prior-knowledge-graph.js';
import {
  parseMisconceptionGraphInput,
  runMisconceptionGraphTool,
} from '../aggregated-misconception-graph.js';
import { parseKeywordGraphInput, runKeywordGraphTool } from '../aggregated-keyword-graph.js';
import { runEefEvidenceTool } from '../aggregated-eef-evidence.js';
import { eefEvidenceToCallToolResult } from '../eef-evidence-egress.js';
import { validateSearchSdkArgs, runSearchSdkTool } from '../aggregated-search/index.js';
import { validateBrowseArgs, runBrowseTool } from '../aggregated-browse/index.js';
import { validateExploreArgs, runExploreTool } from '../aggregated-explore/index.js';
import {
  validateDownloadAssetArgs,
  runDownloadAssetTool,
} from '../aggregated-asset-download/index.js';
import { handleUserSearchExecution } from '../aggregated-user-search/index.js';
import type { ToolName } from '@oaknational/sdk-codegen/mcp-tools';
import type { AggregatedToolName, UniversalToolName } from './types.js';
import { isAggregatedToolName, isUniversalToolName } from './type-guards.js';
import { requireGeneratedToolMetadata } from './descriptor-utils.js';

/**
 * Maps a generated tool execution result to an MCP CallToolResult.
 *
 * Extracts the data from the execution result and formats it appropriately
 * for the MCP response, handling both success and error cases.
 *
 * @param result - Execution result from a generated tool
 * @param toolName - Name of the tool (for widget routing and title lookup)
 * @returns Formatted CallToolResult for MCP
 */
function mapExecutionResult(
  result: ToolExecutionResult,
  toolName: ToolName,
  deps: UniversalToolExecutorDependencies,
): CallToolResult {
  if (!result.ok) {
    return formatError(toErrorMessage(result.error));
  }

  const descriptor = deps.generatedTools.getToolFromToolName(toolName);
  const { title } = requireGeneratedToolMetadata(toolName, descriptor);

  return formatToolResponse({
    summary: `${title}: ${String(result.value.status)}`,
    data: {
      status: result.value.status,
      data: result.value.data,
      // Paginated tools carry the upstream Link-header signal; surfacing it
      // here is the only way the agent can tell whether more pages exist.
      ...(result.value.pagination === undefined ? {} : { pagination: result.value.pagination }),
    },
    toolName,
    annotationsTitle: title,
  });
}

/**
 * Handles curriculum model tool execution (no parameters).
 */
function handleCurriculumModelTool(): CallToolResult {
  return runCurriculumModelTool();
}

/**
 * Handles fetch tool validation and execution.
 */
async function handleFetchTool(
  input: unknown,
  deps: UniversalToolExecutorDependencies,
): Promise<CallToolResult> {
  const validation = validateFetchArgs(input);
  if (!validation.ok) {
    return formatError(validation.message);
  }
  return runFetchTool(validation.value, deps);
}

/**
 * Handles search tool validation and execution via the Search SDK.
 *
 * Dispatches by scope to Elasticsearch-backed retrieval methods
 * (lessons, units, threads, sequences, suggest).
 */
async function handleSearchTool(
  input: unknown,
  deps: UniversalToolExecutorDependencies,
): Promise<CallToolResult> {
  const validation = validateSearchSdkArgs(input);
  if (!validation.ok) {
    return formatError(validation.message);
  }
  return runSearchSdkTool(validation.value, deps);
}

/**
 * Handles browse-curriculum tool validation and execution.
 */
async function handleBrowseTool(
  input: unknown,
  deps: UniversalToolExecutorDependencies,
): Promise<CallToolResult> {
  const validation = validateBrowseArgs(input);
  if (!validation.ok) {
    return formatError(validation.message);
  }
  return runBrowseTool(validation.value, deps);
}

/**
 * Handles explore-topic tool validation and execution.
 */
async function handleExploreTool(
  input: unknown,
  deps: UniversalToolExecutorDependencies,
): Promise<CallToolResult> {
  const validation = validateExploreArgs(input);
  if (!validation.ok) {
    return formatError(validation.message);
  }
  return runExploreTool(validation.value, deps);
}

/**
 * Handles download-asset tool validation and execution.
 */
function handleDownloadAssetTool(
  input: unknown,
  deps: UniversalToolExecutorDependencies,
): Promise<CallToolResult> {
  if (!deps.createAssetDownloadUrl) {
    return Promise.resolve(
      formatError('download-asset is not available in this transport (HTTP-only)'),
    );
  }
  const validation = validateDownloadAssetArgs(input);
  if (!validation.ok) {
    return Promise.resolve(formatError(validation.message));
  }
  return runDownloadAssetTool(validation.value, {
    createAssetDownloadUrl: deps.createAssetDownloadUrl,
    executeMcpTool: deps.executeMcpTool,
    logger: deps.logger,
  });
}

type AggregatedHandler = (
  input: unknown,
  deps: UniversalToolExecutorDependencies,
) => Promise<CallToolResult>;

type CurriculumGraphToolName = Extract<
  AggregatedToolName,
  | 'get-thread-progressions'
  | 'get-prior-knowledge-graph'
  | 'get-misconception-graph'
  | 'get-keyword-graph'
>;

const GRAPH_FALLBACKS = 'Use search, fetch or browse-curriculum instead.';

const GRAPH_UNAVAILABLE_ADVICE: Readonly<Record<GraphCorpusLoadError['kind'], string>> = {
  'not-found': `This is a server-side problem, so retrying will not help. ${GRAPH_FALLBACKS}`,
  'invalid-snapshot': `This is a server-side problem, so retrying will not help. ${GRAPH_FALLBACKS}`,
  'read-failed':
    'This may be temporary, so you can retry this call once with the same arguments. If it fails again, use search, fetch or browse-curriculum instead.',
};

function withCurriculumGraph<Input>(
  tool: CurriculumGraphToolName,
  parse: (input: unknown) => Result<Input, string>,
  run: (input: Input, views: CurriculumGraphViews) => CallToolResult,
): AggregatedHandler {
  return async (rawInput, deps) => {
    const input = parse(rawInput);
    if (!input.ok) {
      return formatError(input.error);
    }
    const logger = resolveUniversalToolLogger(deps);
    const graph = await deps.loadCurriculumGraph();
    if (!graph.ok) {
      logger.error('mcp-tool.curriculum-graph.unavailable', {
        tool,
        kind: graph.error.kind,
        message: graph.error.message,
      });
      return formatError(
        `${tool} could not read Oak's curriculum graph. ${GRAPH_UNAVAILABLE_ADVICE[graph.error.kind]}`,
      );
    }
    try {
      return run(input.value, graph.value);
    } catch (error: unknown) {
      logger.error('mcp-tool.curriculum-graph.failed', normalizeError(error), { tool });
      return formatError(
        `${tool} failed with an internal server error. This was not caused by your input, so do not change the arguments or retry. ${GRAPH_FALLBACKS}`,
      );
    }
  };
}

const AGGREGATED_HANDLERS: Readonly<Record<AggregatedToolName, AggregatedHandler>> = {
  search: handleSearchTool,
  'get-curriculum-model': () => Promise.resolve(handleCurriculumModelTool()),
  'get-thread-progressions': withCurriculumGraph(
    'get-thread-progressions',
    parseThreadProgressionsInput,
    runThreadProgressionsTool,
  ),
  'get-prior-knowledge-graph': withCurriculumGraph(
    'get-prior-knowledge-graph',
    parsePriorKnowledgeGraphInput,
    runPriorKnowledgeGraphTool,
  ),
  'get-misconception-graph': withCurriculumGraph(
    'get-misconception-graph',
    parseMisconceptionGraphInput,
    runMisconceptionGraphTool,
  ),
  'get-keyword-graph': withCurriculumGraph(
    'get-keyword-graph',
    parseKeywordGraphInput,
    runKeywordGraphTool,
  ),
  'get-eef-evidence': (input) =>
    Promise.resolve(eefEvidenceToCallToolResult(runEefEvidenceTool(input))),
  fetch: handleFetchTool,
  'browse-curriculum': handleBrowseTool,
  'explore-topic': handleExploreTool,
  'download-asset': handleDownloadAssetTool,
  'user-search': handleUserSearchExecution,
  'user-search-query': handleUserSearchExecution,
};

function executeAggregatedTool(
  name: AggregatedToolName,
  input: unknown,
  deps: UniversalToolExecutorDependencies,
): Promise<CallToolResult> {
  const handler = AGGREGATED_HANDLERS[name];
  return handler(input, deps);
}

/**
 * Creates a universal tool executor for MCP tool invocations.
 *
 * The executor handles both aggregated tools (search, fetch, get-curriculum-model, etc.)
 * and generated tools from the OpenAPI schema. It performs
 * the following steps:
 *
 * 1. Validates the tool name is known
 * 2. Dispatches to the appropriate handler based on tool type
 * 3. Validates input for the specific tool
 * 4. Executes the tool and returns formatted results
 *
 * @param deps - Dependencies including:
 *   - `executeMcpTool`: Function to execute generated tools via API client
 *   - Other dependencies as needed by aggregated tools
 * @returns Async function that executes a tool by name with arguments
 *
 * @example
 * ```typescript
 * const executor = createUniversalToolExecutor({
 *   executeMcpTool: async (name, args) => apiClient.call(name, args),
 * });
 *
 * const result = await executor('search', { query: 'photosynthesis' });
 * ```
 */
export function createUniversalToolExecutor(
  deps: UniversalToolExecutorDependencies,
): (name: UniversalToolName, args: unknown) => Promise<CallToolResult> {
  return async (name: UniversalToolName, args: unknown): Promise<CallToolResult> => {
    if (!isUniversalToolName(name, deps.generatedTools.isToolName)) {
      return formatUnknownTool(name);
    }

    const input = args === undefined ? {} : args;

    if (isAggregatedToolName(name)) {
      return executeAggregatedTool(name, input, deps);
    }

    const result = await deps.executeMcpTool(name, input);
    return mapExecutionResult(result, name, deps);
  };
}

// Re-export dependencies type for convenience
export type { UniversalToolExecutorDependencies } from '../universal-tool-shared.js';

/**
 * Execution logic for the download-asset tool.
 *
 * Validates input, proves the lesson and requested asset exist via the
 * same tool surface `get-lessons-assets` serves to clients, and only then
 * delegates URL generation to the injected factory function provided by
 * the HTTP app layer. The factory creates HMAC-signed, short-lived URLs
 * pointing to the download proxy route — a signature is a promise the
 * proxy can keep, so it is never minted for unproven input (MCP-321).
 */

import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { isAssetType, ASSET_TYPES } from '@oaknational/sdk-codegen/api-schema';
import type { AssetType } from '@oaknational/sdk-codegen/api-schema';
import { rawCurriculumSchemas } from '@oaknational/sdk-codegen/zod';
import type { ToolExecutionResult } from '../execute-tool-call.js';
import { McpToolError } from '../error-types.js';
import type { Logger } from '@oaknational/logger';
import {
  formatToolResponse,
  formatError,
  toErrorMessage,
  resolveUniversalToolLogger,
} from '../universal-tool-shared.js';

/**
 * Validated arguments for the download-asset tool.
 */
export interface DownloadAssetArgs {
  readonly lesson: string;
  readonly type: AssetType;
}

/**
 * Dependencies injected by the HTTP app layer.
 */
export interface DownloadAssetDeps {
  readonly createAssetDownloadUrl: (lesson: string, type: string) => string;
  /**
   * Executor for the existence lookup — the same seam the fetch tool uses
   * for lesson resolution, pointed here at `get-lessons-assets` so one
   * call proves both the lesson and its available asset types.
   */
  readonly executeMcpTool: (
    name: 'get-lessons-assets',
    args: unknown,
  ) => Promise<ToolExecutionResult>;
  /** Structured-emission logger per ADR-162; a no-op fallback when omitted. */
  readonly logger?: Logger;
}

type ValidationResult =
  | { readonly ok: true; readonly value: DownloadAssetArgs }
  | { readonly ok: false; readonly message: string };

const DownloadAssetObjectSchema = z
  .object({
    lesson: z.string().min(1),
    type: z.string(),
  })
  .strict();

/**
 * The assets listing is validated with the same generated contract schema
 * the lookup's own output validation already applied — re-parsing with it
 * narrows the wide result union without ever introducing a refusal path
 * the contract does not have (`assets` is optional; `oakUrl` required).
 */
const AssetsListingSchema = rawCurriculumSchemas.LessonAssetsResponseSchema;

/**
 * Validates raw input for the download-asset tool.
 *
 * Checks that `lesson` is a non-empty string and `type` is a valid
 * asset type from the generated OpenAPI schema.
 */
export function validateDownloadAssetArgs(input: unknown): ValidationResult {
  const parsed = DownloadAssetObjectSchema.safeParse(input);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    const field = firstIssue?.path[0] ?? 'input';
    return {
      ok: false,
      message: `Invalid "${String(field)}": ${firstIssue?.message ?? 'validation failed'}`,
    };
  }

  if (!isAssetType(parsed.data.type)) {
    return {
      ok: false,
      message: `Missing or invalid "type" — expected one of: ${ASSET_TYPES.join(', ')}`,
    };
  }

  return { ok: true, value: { lesson: parsed.data.lesson, type: parsed.data.type } };
}

/**
 * Formats the refusal for a failed assets lookup.
 *
 * @remarks
 * Slug-hunting advice only fits the not-found cause; for restricted,
 * auth, or upstream failures it would send the agent chasing a slug
 * that was never the problem.
 */
function formatLookupRefusal(lesson: string, error: unknown): CallToolResult {
  const isNotFound = error instanceof McpToolError && error.code === 'RESOURCE_NOT_FOUND';
  const advice = isNotFound
    ? ' Check the lesson slug — the search or get-lessons-summary tools can confirm it.'
    : '';
  return formatError(
    `Cannot create a download link for lesson "${lesson}": ${toErrorMessage(error)}.${advice}`,
  );
}

/**
 * Executes the download-asset tool.
 *
 * Proves the lesson exists and carries the requested asset type via
 * `get-lessons-assets`, then generates a signed, short-lived download URL
 * via the injected factory. Any lookup failure — lesson not found,
 * restricted resource, transport error, unrecognisable listing — refuses
 * to sign and returns the actionable reason instead, matching the
 * not-found behaviour `fetch` models.
 *
 * @param args - Validated download asset arguments
 * @param deps - Dependencies with URL factory and lookup executor
 * @returns CallToolResult with download URL, or an actionable error
 */
export async function runDownloadAssetTool(
  args: DownloadAssetArgs,
  deps: DownloadAssetDeps,
): Promise<CallToolResult> {
  const logger = resolveUniversalToolLogger(deps);
  logger.debug('mcp-tool.download-asset.execute', {
    toolName: 'download-asset',
    lesson: args.lesson,
    type: args.type,
  });

  const lookup = await deps.executeMcpTool('get-lessons-assets', { lesson: args.lesson });
  if (!lookup.ok) {
    return formatLookupRefusal(args.lesson, lookup.error);
  }

  const listing = AssetsListingSchema.safeParse(lookup.value.data);
  if (!listing.success) {
    return formatError(
      `Cannot create a download link for lesson "${args.lesson}": the assets lookup returned an ` +
        'unrecognisable listing, so the asset cannot be verified.',
    );
  }

  const availableTypes = listing.data.assets?.map((asset) => asset.type) ?? [];
  if (!availableTypes.includes(args.type)) {
    const available = availableTypes.length > 0 ? availableTypes.join(', ') : 'none';
    return formatError(
      `Lesson "${args.lesson}" has no "${args.type}" asset. Available asset types: ${available}. ` +
        `The lesson page is ${listing.data.oakUrl}.`,
    );
  }

  const url = deps.createAssetDownloadUrl(args.lesson, args.type);

  return formatToolResponse({
    summary: `Download link (valid for 5 minutes): ${url}`,
    data: { downloadUrl: url, lesson: args.lesson, type: args.type },
    toolName: 'download-asset',
    annotationsTitle: 'Download Asset',
  });
}

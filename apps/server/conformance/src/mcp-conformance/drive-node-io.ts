import { createRequire } from 'node:module';
import { join } from 'node:path';

import { err } from '@oaknational/result';

import { composeDriveCallArgs, composeDriveListArgs, type DriveIo } from './drive.js';
import { buildMcpConformanceNodeIo, writeUnder } from './node-io.js';

/**
 * The drive operation's real IO (MCP-303), split from `node-io.ts` to keep
 * each IO module inside the file budget: rides the suites' spawn seam and
 * owner-only retention, adds the drive's per-tool evidence discipline.
 */

/** Filename-safe projection of a wire tool name (path metacharacters replaced). */
function toolFileName(toolName: string): string {
  return `${toolName.replaceAll(/[^A-Za-z0-9._-]/gu, '_')}.json`;
}

export interface DriveNodeIoInput {
  readonly target: string;
  readonly credentialsFile?: string;
}

/**
 * One method per vendor operation, with each call's stdout retained
 * verbatim under `<report-dir>/tools/` — the pack is a traceable
 * projection, so every "exercised" claim needs an artefact behind it. A
 * completed call whose evidence cannot be retained comes back as an error
 * (the false-green twin of a silently-missing summary).
 */
export function buildDriveNodeIo(
  repoRoot: string,
  reportDir: string,
  input: DriveNodeIoInput,
): DriveIo {
  const spawn = buildMcpConformanceNodeIo(repoRoot, reportDir).runMcpjam;
  const credentials =
    input.credentialsFile === undefined ? {} : { credentialsFile: input.credentialsFile };
  return {
    listTools: () => spawn(composeDriveListArgs({ target: input.target, ...credentials })),
    callTool: (toolName, toolArgs) => {
      const result = spawn(
        composeDriveCallArgs({ target: input.target, toolName, toolArgs, ...credentials }),
      );
      if (!result.ok) {
        return result;
      }
      const retained = writeUnder(
        repoRoot,
        join(reportDir, 'tools'),
        toolFileName(toolName),
        result.value.stdout,
      );
      if (!retained.ok) {
        return err(
          new Error(`the call completed but its evidence could not be retained: ${retained.error}`),
        );
      }
      return result;
    },
  };
}

/**
 * The pinned vendor CLI's version, for pack provenance. Resolution rides
 * the same repo-root-anchored require as the bin itself; a failure is
 * reported as the literal string 'unknown' rather than blocking a run —
 * provenance is evidence about the run, never a gate on it.
 */
export function resolveMcpjamVersion(repoRoot: string): string {
  try {
    const manifest: unknown = createRequire(join(repoRoot, 'package.json'))(
      '@mcpjam/cli/package.json',
    );
    const version =
      typeof manifest === 'object' && manifest !== null && 'version' in manifest
        ? manifest.version
        : undefined;
    return typeof version === 'string' && version.length > 0 ? version : 'unknown';
  } catch {
    return 'unknown';
  }
}

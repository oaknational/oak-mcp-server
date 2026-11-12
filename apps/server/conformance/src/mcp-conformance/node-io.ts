/**
 * Node IO for `agent-tools mcp-conformance` (MCP-189): the real spawn seam
 * over the lockfile-installed `@mcpjam/cli` bin, and raw-report retention
 * under a caller-chosen directory (absolute, or relative to the repo root).
 *
 * Bin resolution: the bare `@mcpjam/cli` specifier is resolved with a
 * `createRequire` anchored at the repo root — resolution-only, matching the
 * bootstrap precedent — which today yields `dist/index.js`, the same file
 * the package's `bin` entry names (verified 3.15.2; a future main/bin split
 * would fail loudly at the parse boundary). The child runs under the
 * current Node executable; no `npx`, no PATH lookup, no network at
 * install-drift risk.
 */
import { spawnSync } from 'node:child_process';
import { closeSync, fchmodSync, mkdirSync, openSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';

import { err, ok, type Result } from '@oaknational/result';

import { boundedExcerpt } from './bounded-excerpt.js';
import { type McpConformanceIo, type RetentionOutcome } from './io-port.js';
import { type McpjamSpawnResult } from './runner.js';
import { type ConformanceSuite } from './types.js';

/**
 * Generous per-suite ceiling: observed suite durations against the deployed
 * alpha are 1–4 s (2026-07-26); the ceiling exists so a hung SSE stream
 * cannot hold a CI job to the runner's own timeout.
 */
const SUITE_TIMEOUT_MS = 120_000;

/** Raw json-summary documents are single-digit KiB; 16 MiB is unreachable headroom. */
const MAX_STDOUT_BYTES = 16 * 1024 * 1024;

function resolveMcpjamBin(repoRoot: string): Result<string, Error> {
  try {
    return ok(createRequire(join(repoRoot, 'package.json')).resolve('@mcpjam/cli'));
  } catch (error) {
    return err(
      new Error(
        `@mcpjam/cli did not resolve from the repo root — run pnpm install (lockfile-declared devDependency): ${
          error instanceof Error ? error.message : String(error)
        }`,
      ),
    );
  }
}

function spawnMcpjam(
  repoRoot: string,
  binPath: string,
  args: readonly string[],
): Result<McpjamSpawnResult, Error> {
  const child = spawnSync(process.execPath, [binPath, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: SUITE_TIMEOUT_MS,
    // SIGKILL, not the default SIGTERM: SIGTERM is ignorable, so a child
    // that traps it (or is wedged inside an uninterruptible await) would
    // outlive the ceiling and the advertised timeout would not be real.
    killSignal: 'SIGKILL',
    maxBuffer: MAX_STDOUT_BYTES,
  });
  if (child.error !== undefined) {
    // A timeout sets BOTH `error` (ETIMEDOUT) and `signal`, so this branch
    // fires first — the captured streams must ride the error here too, or
    // the timeout case (where diagnostics matter most) loses them.
    return err(
      new Error(
        `${child.error.message}` +
          `${boundedExcerpt('partial stdout', child.stdout ?? '')}` +
          `${boundedExcerpt('stderr', child.stderr ?? '')}`,
      ),
    );
  }
  if (child.signal !== null) {
    // A signal death (typically the timeout ceiling) is a LAUNCH FAILURE to
    // the orchestration: retention never runs on this path, so no evidence
    // artefact survives it — bounded DIAGNOSTICS of both streams ride the
    // error instead, so the operator still sees what the child said.
    return err(
      new Error(
        `mcpjam died on signal ${child.signal} (timeout ceiling ${String(SUITE_TIMEOUT_MS)}ms)` +
          `${boundedExcerpt('partial stdout', child.stdout)}${boundedExcerpt('stderr', child.stderr)}`,
      ),
    );
  }
  return ok({ exitCode: child.status ?? undefined, stdout: child.stdout, stderr: child.stderr });
}

// Writes resolve against the repo root; an absolute reportDir stands as
// given. The REPORTED path preserves the caller's own form (relative in,
// repo-root-relative out; absolute in, absolute out) so the emitted
// report never names a path that does not exist.
// OWNER-ONLY, established BEFORE any content lands. Attended runs retain
// AUTHENTICATED vendor output here, and the report shapes constrain none
// of `error`, `output`, `details` or the captured stderr — a bearer or
// refresh token reaching any of them lands in this file, so the process
// default (0644 under a 022 umask) would expose it to every other user on
// a shared host.
//
// ORDER IS THE WHOLE POINT, and write-then-chmod gets it wrong: the `mode`
// argument applies only when the file is CREATED, so re-writing a report
// left 0644 by an older build would put the authenticated payload on disk
// world-readable and only tighten it afterwards — and if the chmod then
// failed, the content would stay exposed while retention reported failure.
//
// Opening with 'w' truncates to zero length first, so the file is EMPTY at
// this point; `fchmodSync` then tightens it (on the descriptor, so no path
// can be swapped underneath us); only then does content land. A chmod
// failure throws before the write, leaving an empty file and a loud
// retention failure rather than an exposed one. Every throw propagates to
// the caller's catch — including a close failure (EBADF/EIO — the write
// may not have flushed), which is why the success-path close sits INSIDE
// the try and the finally is error-path best-effort only (the caller's
// outcome already carries the true cause; a second throw here would
// replace it with the less useful close error).
function writeOwnerOnly(filePath: string, content: string): void {
  let handle: number | undefined;
  try {
    handle = openSync(filePath, 'w', 0o600);
    fchmodSync(handle, 0o600);
    writeFileSync(handle, content, { encoding: 'utf8' });
    closeSync(handle);
    handle = undefined;
  } finally {
    if (handle !== undefined) {
      try {
        closeSync(handle);
      } catch {
        // Descriptor leak at worst — the true failure is already propagating.
      }
    }
  }
}

/**
 * Owner-only write of one file under a directory (created if absent),
 * resolving relative paths against the repo root. Shared by the suites'
 * retention here and the drive's per-tool evidence retention
 * (`drive-node-io.ts`) — every retained artefact can embed authed vendor
 * output, so all of them get the 0600 discipline above.
 */
export function writeUnder(
  repoRoot: string,
  reportDir: string,
  fileName: string,
  content: string,
): RetentionOutcome {
  const writeDir = resolve(repoRoot, reportDir);
  const reportedPath = join(reportDir, fileName);
  try {
    mkdirSync(writeDir, { recursive: true });
    writeOwnerOnly(join(writeDir, fileName), content);
    return { ok: true, reportedPath };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function retainUnder(repoRoot: string, reportDir: string) {
  return (suite: ConformanceSuite, content: string): RetentionOutcome =>
    writeUnder(repoRoot, reportDir, `${suite}.json`, content);
}

/**
 * Default raw-report directory for a run: `tmp/mcp-conformance/<utc-stamp>`,
 * relative to the repo root. Lives with the IO seam because the wall-clock
 * read is an IO concern; both CLI operations (suites and drive) share it.
 */
export function defaultReportDir(): string {
  const utcStamp = new Date()
    .toISOString()
    .replaceAll(':', '-')
    .replace(/\.\d+Z$/u, 'Z');
  return join('tmp', 'mcp-conformance', utcStamp);
}

/**
 * Persist the wrapper's own aggregate report as `<report-dir>/summary.json`
 * so the report directory (and any CI artifact built from it) carries the
 * verdict document — divergences and failure reasons — alongside the raw
 * per-suite evidence, and stdout purity is never load-bearing.
 */
export function writeRunSummary(
  repoRoot: string,
  reportDir: string,
  reportJson: string,
): RetentionOutcome {
  return writeUnder(repoRoot, reportDir, 'summary.json', reportJson);
}

/**
 * Build the real IO seam.
 *
 * @param repoRoot - Absolute repository root (worktree-safe, from `resolveRepoRoot`).
 * @param reportDir - Raw-report directory: absolute, or relative to the repo root.
 */
export function buildMcpConformanceNodeIo(repoRoot: string, reportDir: string): McpConformanceIo {
  return {
    runMcpjam: (args) => {
      const bin = resolveMcpjamBin(repoRoot);
      if (bin.ok) {
        return spawnMcpjam(repoRoot, bin.value, args);
      }
      return bin;
    },
    retainRawReport: retainUnder(repoRoot, reportDir),
  };
}

/**
 * Write owner-only at an ABSOLUTE path, creating parent directories. The
 * same write-then-never-expose discipline as `writeUnder`, for artefacts
 * whose destination the caller has already resolved (the reviewer pack via
 * `--pack-out`): the pack embeds vendor failure text from authed runs, the
 * same content class the summary protects at 0600.
 */
export function retainOwnerOnlyAt(absolutePath: string, content: string): RetentionOutcome {
  try {
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeOwnerOnly(absolutePath, content);
    return { ok: true, reportedPath: absolutePath };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

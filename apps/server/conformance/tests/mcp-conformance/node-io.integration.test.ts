import { chmodSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { unwrapErr } from '@oaknational/result';
import { afterEach, describe, expect, it } from 'vitest';

import { buildMcpConformanceNodeIo, writeRunSummary } from '../../src/mcp-conformance/node-io.js';
import {
  cleanupSandboxes,
  readSandboxFile,
  sandbox,
  writeSandboxFile,
} from './test-helpers/io-sandbox.js';

afterEach(() => {
  cleanupSandboxes();
});

/**
 * POSIX permission bits as an octal string (e.g. `'600'`). Read as a string
 * rather than masked numerically so the assertion reads as the `chmod` form
 * an operator would check with.
 */
function permissionsOf(path: string): string {
  return statSync(path).mode.toString(8).slice(-3);
}

describe('retainRawReport — verbatim retention with caller-shaped paths', () => {
  it('a relative report dir writes under the repo root and reports the relative path', () => {
    const root = sandbox();
    const io = buildMcpConformanceNodeIo(root, join('tmp', 'reports'));
    const outcome = io.retainRawReport('protocol', '{"raw":"bytes"}');
    expect(outcome).toEqual({ ok: true, reportedPath: join('tmp', 'reports', 'protocol.json') });
    expect(readSandboxFile(root, 'tmp', 'reports', 'protocol.json')).toBe('{"raw":"bytes"}');
  });

  it('an absolute report dir stands as given — written there and reported verbatim', () => {
    const root = sandbox();
    const elsewhere = join(sandbox(), 'evidence');
    const io = buildMcpConformanceNodeIo(root, elsewhere);
    const outcome = io.retainRawReport('oauth', 'verbatim');
    expect(outcome).toEqual({ ok: true, reportedPath: join(elsewhere, 'oauth.json') });
    expect(readSandboxFile(elsewhere, 'oauth.json')).toBe('verbatim');
  });

  it('an unwritable target is a loud retention failure, never a throw', () => {
    const root = sandbox();
    // Occupy the report-dir path with a FILE so mkdir cannot create it.
    writeSandboxFile('a file where a directory must go', root, 'blocked');
    const io = buildMcpConformanceNodeIo(root, 'blocked');
    const outcome = io.retainRawReport('protocol', 'content');
    expect(outcome.ok).toBe(false);
    expect(!outcome.ok && outcome.error.length > 0).toBe(true);
  });

  it('the aggregate summary lands beside the raw reports with the caller-shaped path', () => {
    const root = sandbox();
    const outcome = writeRunSummary(root, join('tmp', 'reports'), '{"verdict":"pass"}');
    expect(outcome).toEqual({ ok: true, reportedPath: join('tmp', 'reports', 'summary.json') });
    expect(readSandboxFile(root, 'tmp', 'reports', 'summary.json')).toBe('{"verdict":"pass"}');
  });

  it('a retained report is owner-only — attended runs carry credentials in vendor output', () => {
    const root = sandbox();
    const io = buildMcpConformanceNodeIo(root, join('tmp', 'reports'));
    io.retainRawReport('protocol', '{"raw":"bytes"}');
    expect(permissionsOf(join(root, 'tmp', 'reports', 'protocol.json'))).toBe('600');
  });

  it('the aggregate summary is owner-only too — it embeds the same vendor fields', () => {
    const root = sandbox();
    writeRunSummary(root, join('tmp', 'reports'), '{"verdict":"pass"}');
    expect(permissionsOf(join(root, 'tmp', 'reports', 'summary.json'))).toBe('600');
  });

  it('an existing world-readable report has its MODE corrected, not just its content', () => {
    // `mode` on writeFileSync applies at creation only, so a report left by an
    // earlier run under a looser umask would keep its permissions forever.
    const root = sandbox();
    const io = buildMcpConformanceNodeIo(root, join('tmp', 'reports'));
    io.retainRawReport('protocol', 'first run');
    const path = join(root, 'tmp', 'reports', 'protocol.json');
    chmodSync(path, 0o644);

    io.retainRawReport('protocol', 'second run');

    expect(permissionsOf(path)).toBe('600');
  });
});

// The resolve-and-spawn happy path is deliberately NOT proven here: test code
// must not spawn child processes (testing-strategy §Rules), and the real bin
// under the real install is exercised live by the scheduled unattended CI
// workflow on every run. This block describes OUR half of the seam only —
// the spawn-free resolution-failure branch.
describe('runMcpjam — bin-resolution failure is loud and spawn-free', () => {
  it('a root without the dependency yields a launch error naming pnpm install', () => {
    const emptyRoot = sandbox();
    const io = buildMcpConformanceNodeIo(emptyRoot, 'tmp/unused');
    const error = unwrapErr(io.runMcpjam(['--version']));
    expect(error.message).toContain('pnpm install');
  });
});

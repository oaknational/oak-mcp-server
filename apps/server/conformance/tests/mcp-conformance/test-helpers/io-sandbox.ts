/**
 * Hermetic filesystem sandbox for the mcp-conformance integration tests:
 * real IO on behalf of tests, homed on the `test-helpers/` surface per the
 * no-real-io-in-tests structural allowlist. Each sandbox is a fresh temp
 * directory; `cleanupSandboxes` removes everything a test file created.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const created: string[] = [];

/** Create a fresh temp directory, tracked for cleanup. */
export function sandbox(): string {
  const dir = mkdtempSync(join(tmpdir(), 'mcp-conformance-io-'));
  created.push(dir);
  return dir;
}

/** Remove every sandbox created since the last cleanup. */
export function cleanupSandboxes(): void {
  for (const dir of created.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Read a sandbox file as UTF-8. */
export function readSandboxFile(...segments: string[]): string {
  return readFileSync(join(...segments), 'utf8');
}

/** Write a sandbox file as UTF-8. */
export function writeSandboxFile(content: string, ...segments: string[]): void {
  writeFileSync(join(...segments), content, 'utf8');
}

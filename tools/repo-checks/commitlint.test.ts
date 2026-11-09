import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = join(import.meta.dirname, '..', '..');

function lint(message: string): { status: number | null; output: string } {
  const { status, stdout, stderr } = spawnSync(
    'pnpm',
    ['--silent', 'exec', 'commitlint', '--config', 'commitlint.config.mjs'],
    { cwd: root, input: message, encoding: 'utf8' },
  );
  return { status, output: stdout + stderr };
}

describe('commitlint config', () => {
  it('accepts a leading Linear id', () => {
    expect(lint('MCP-812: feat(server): add tool').status).toBe(0);
  });

  it('accepts a plain conventional header', () => {
    expect(lint('feat(server): add tool').status).toBe(0);
  });

  it('rejects a message that is not conventional', () => {
    const result = lint('stuff');
    expect(result.status).not.toBe(0);
    expect(result.output).toContain('type-empty');
  });
});

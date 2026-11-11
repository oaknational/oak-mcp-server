import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = join(import.meta.dirname, '..', '..');
const operatorLocal = [
  'CLAUDE.local.md',
  'AGENTS.local.md',
  '.claude/settings.local.json',
  '.env',
  '.env.local',
];

describe('.gitignore', () => {
  it.each(operatorLocal)('ignores %s', (path) => {
    const { status, stdout } = spawnSync('git', ['check-ignore', '--no-index', path], {
      cwd: root,
      encoding: 'utf8',
    });
    expect(status).toBe(0);
    expect(stdout.trim()).toBe(path);
  });

  it('ignores the gate log directory', () => {
    const { status } = spawnSync('git', ['check-ignore', '--no-index', '.cache/last-gate.log'], {
      cwd: root,
    });
    expect(status).toBe(0);
  });
});

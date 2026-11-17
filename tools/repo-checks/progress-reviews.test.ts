import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = join(import.meta.dirname, '..', '..');
const hook = join(root, '.claude', 'hooks', 'progress-reviews.sh');

interface Settings {
  hooks?: { SessionStart?: { hooks: { type: string; command: string }[] }[] };
}

describe('progress-reviews SessionStart hook', () => {
  const run = spawnSync(hook, { encoding: 'utf8' });

  it('exits 0', () => {
    expect(run.error).toBeUndefined();
    expect(run.status).toBe(0);
  });

  it('asks for recurring reviews at 30 minutes, 60 minutes and 4 hours, off :00 and :30', () => {
    expect(run.stdout).toContain('CronCreate');
    expect(run.stdout).toMatch(/30 minutes/);
    expect(run.stdout).toMatch(/60 minutes/);
    expect(run.stdout).toMatch(/4 hours/);
    expect(run.stdout).toMatch(/not :00 or :30/);
  });

  it('makes the 60-minute review name one learning and act on it', () => {
    expect(run.stdout).toMatch(
      /every 60 minutes: name one learning from the hour .*and act on it, by encoding it as a check, skill or doc, or by raising it/,
    );
  });

  it('points to the AGENTS.md rule, which exists', () => {
    expect(run.stdout).toContain('`progress-reviews` rule in AGENTS.md');
    expect(readFileSync(join(root, 'AGENTS.md'), 'utf8')).toContain('(`progress-reviews`)');
  });

  it('is registered under SessionStart in the committed settings', () => {
    const settings = JSON.parse(
      readFileSync(join(root, '.claude', 'settings.json'), 'utf8'),
    ) as Settings;
    const commands = (settings.hooks?.SessionStart ?? []).flatMap((entry) =>
      entry.hooks.map((h) => h.command),
    );
    expect(commands).toContain('"$CLAUDE_PROJECT_DIR"/.claude/hooks/progress-reviews.sh');
  });
});

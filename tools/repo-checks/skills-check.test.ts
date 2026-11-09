import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const repoRoot = join(import.meta.dirname, '../..');
const script = join(import.meta.dirname, 'skills-check.ts');
const skill = 'oak-tdd/SKILL.md';
let copy = '';

function run(root: string): { status: number | null; stdout: string; stderr: string } {
  return spawnSync('node', [script, root], { encoding: 'utf8' });
}

beforeEach(() => {
  copy = mkdtempSync(join(tmpdir(), 'skills-check-'));
  cpSync(join(repoRoot, 'oak-skills.json'), join(copy, 'oak-skills.json'));
  for (const base of ['.agents/skills', '.claude/skills']) {
    cpSync(join(repoRoot, base), join(copy, base), { recursive: true });
  }
});

afterEach(() => {
  rmSync(copy, { recursive: true, force: true });
});

describe('skills-check', () => {
  it('passes on the committed skills', () => {
    const result = run(repoRoot);
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('skills in sync');
  });

  it('fails and names an edited file', () => {
    writeFileSync(join(copy, '.agents/skills', skill), 'edited\n');
    const result = run(copy);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`.agents/skills/${skill}`);
  });

  it('fails and names a missing file', () => {
    unlinkSync(join(copy, '.claude/skills', skill));
    const result = run(copy);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`.claude/skills/${skill}: missing`);
  });

  it('fails and names an added file', () => {
    writeFileSync(join(copy, '.agents/skills/oak-tdd/extra.md'), 'extra\n');
    const result = run(copy);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('.agents/skills/oak-tdd/extra.md');
  });

  it('fails on an unselected oak skill', () => {
    mkdirSync(join(copy, '.claude/skills/oak-sos-draft'));
    const result = run(copy);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('.claude/skills/oak-sos-draft');
  });
});

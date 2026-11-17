import { spawnSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
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

  it('fails when a local skill is not mirrored into .claude/skills', () => {
    rmSync(join(copy, '.claude/skills/mcp-tool-design'), { recursive: true });
    const result = run(copy);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('.claude/skills/mcp-tool-design/SKILL.md: missing');
  });

  it('fails when a mirrored local skill differs from its source', () => {
    writeFileSync(join(copy, '.claude/skills/mcp-tool-design/SKILL.md'), 'drifted\n');
    const result = run(copy);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('.claude/skills/mcp-tool-design/SKILL.md: differs');
  });

  it('fails on a symlink inside a local skill', () => {
    symlinkSync(join(repoRoot, 'README.md'), join(copy, '.agents/skills/mcp-tool-design/link.md'));
    const result = run(copy);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      '.agents/skills/mcp-tool-design/link.md: symlink, local skills hold regular files only',
    );
  });

  describe('mirror-only entries', () => {
    it('fails on a file added to a mirrored local skill with no source', () => {
      writeFileSync(join(copy, '.claude/skills/mcp-tool-design/extra.md'), 'extra\n');
      const result = run(copy);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('.claude/skills/mcp-tool-design/extra.md: no counterpart');
    });

    it('fails on a skill directory that exists only under .claude/skills', () => {
      mkdirSync(join(copy, '.claude/skills/stray'));
      writeFileSync(join(copy, '.claude/skills/stray/SKILL.md'), 'stray\n');
      const result = run(copy);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('.claude/skills/stray: no counterpart');
    });

    it('fails on an empty directory under .claude/skills', () => {
      mkdirSync(join(copy, '.claude/skills/hollow'));
      const result = run(copy);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('.claude/skills/hollow: no counterpart');
    });

    it('fails on a loose file directly under .claude/skills', () => {
      writeFileSync(join(copy, '.claude/skills/notes.md'), 'notes\n');
      const result = run(copy);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('.claude/skills/notes.md: no counterpart');
    });

    it('fails on an extra file added to a vendored skill under .claude/skills', () => {
      writeFileSync(join(copy, '.claude/skills/oak-tdd/extra.md'), 'extra\n');
      const result = run(copy);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('.claude/skills/oak-tdd/extra.md');
    });

    it('fails on a symlinked skill directory under .claude/skills', () => {
      symlinkSync('/etc', join(copy, '.claude/skills/linked'));
      const result = run(copy);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('.claude/skills/linked: symlink');
    });

    it('fails on a symlink inside a mirrored local skill', () => {
      symlinkSync('/etc', join(copy, '.claude/skills/mcp-tool-design/link'));
      const result = run(copy);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('.claude/skills/mcp-tool-design/link: symlink');
    });

    it('passes the Claude-only verify skill', () => {
      expect(run(copy).status).toBe(0);
    });
  });

  it.each([
    ['a file symlink', join(repoRoot, 'README.md'), 'oak-tdd/file-link.md'],
    ['a directory symlink', '/etc', 'oak-tdd/dir-link'],
    ['a dangling symlink', '/nonexistent-target', 'oak-tdd/dangling-link'],
    ['a symlinked skill directory', '/etc', 'oak-pr-create'],
  ])('fails and names %s', (_name, target, link) => {
    const path = join(copy, '.agents/skills', link);
    if (link === 'oak-pr-create') {
      rmSync(path, { recursive: true });
    }
    symlinkSync(target, path);
    const result = run(copy);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`.agents/skills/${link}: symlink`);
  });
});

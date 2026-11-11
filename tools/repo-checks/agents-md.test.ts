import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = join(import.meta.dirname, '../..');
const agents = readFileSync(join(root, 'AGENTS.md'), 'utf8');
const scripts = new Set(
  Object.keys(
    (
      JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
        scripts: Record<string, string>;
      }
    ).scripts,
  ),
);

const FLOW =
  'Design each change to land as a small PR, about 5 authored files and 10 at most. Split the work before branching, not under review. Build dependent PRs as a native GitHub stack with `gh stack`. This repository keeps at most 3 open layers in a stack. Each layer lands as soon as it is approved. A branch lives about a working day, unless a named review or infrastructure gate holds it.';

function ruleBullets(): string[] {
  const start = agents.indexOf('\n## Rules\n');
  const rest = agents.slice(start + 1);
  const next = rest.indexOf('\n## ', 1);
  return rest
    .slice(0, next === -1 ? undefined : next)
    .split('\n')
    .filter((line) => line.startsWith('- '));
}

describe('AGENTS.md', () => {
  it('stays under 150 lines', () => {
    expect(agents.split('\n').length).toBeLessThan(150);
  });

  it('is the only content CLAUDE.md imports', () => {
    expect(readFileSync(join(root, 'CLAUDE.md'), 'utf8').trim()).toBe('@AGENTS.md');
  });

  it('names only pnpm scripts that exist in package.json', () => {
    const commands = [...agents.matchAll(/`pnpm ([a-z][\w:-]*)/g)].map((match) => match[1] ?? '');
    const named = commands.filter((name) => !['exec', 'install', 'add'].includes(name));
    expect(named.length).toBeGreaterThan(0);
    for (const name of named) {
      expect(scripts.has(name), `pnpm ${name} is not a package.json script`).toBe(true);
    }
  });

  it('links only to files that exist', () => {
    const targets = [...agents.matchAll(/\]\(([^)#\s]+)\)/g)].map((match) => match[1] ?? '');
    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) {
      expect(existsSync(join(root, dirname('AGENTS.md'), target)), `${target} is missing`).toBe(
        true,
      );
    }
  });

  it('links each rule to its check or marks it prose-only', () => {
    const bullets = ruleBullets();
    expect(bullets.length).toBeGreaterThan(0);
    for (const bullet of bullets) {
      expect(bullet, bullet).toMatch(/\]\([^)]+\)|`prose-only`|`prose-only`/);
    }
  });

  it('copies the canonical flow text word for word', () => {
    expect(agents).toContain(`> ${FLOW}`);
  });

  it('keeps operator-local names out', () => {
    expect(agents).not.toMatch(/CLAUDE\.local|AGENTS\.local|settings\.local/);
  });
});

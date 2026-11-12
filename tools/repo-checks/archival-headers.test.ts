import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = join(import.meta.dirname, '..', '..');
const archivalRoots = ['docs/adr/mcp', 'docs/engineering'];
const indexPath = 'docs/adr/mcp/README.md';

function markdownUnder(directory: string): string[] {
  return readdirSync(join(root, directory), { recursive: true, encoding: 'utf8' })
    .filter((name) => name.endsWith('.md'))
    .map((name) => join(directory, name));
}

const archival = archivalRoots.flatMap(markdownUnder).filter((path) => path !== indexPath);
const headerPattern = /^> OOCE path: `([^`]+\.md)`\n> OOCE SHA: `([0-9a-f]{40})`$/m;

describe('archival docs', () => {
  it('finds the copied docs', () => {
    expect(archival.length).toBe(27 + 5);
  });

  it.each(archival)('%s carries its OOCE path and SHA in a header', (path) => {
    const head = readFileSync(join(root, path), 'utf8').split('\n').slice(0, 6).join('\n');
    const match = headerPattern.exec(head);
    expect(match, `no header in ${path}`).not.toBeNull();
    expect(match?.[2]).toBe(pinnedSha());
  });

  it('keeps each ADR number from OOCE in its file name', () => {
    for (const path of archival.filter((p) => p.startsWith('docs/adr/mcp/'))) {
      const head = readFileSync(join(root, path), 'utf8');
      const ooce = headerPattern.exec(head)?.[1] ?? '';
      expect(relative('docs/adr/mcp', path)).toBe(ooce.split('/').pop());
    }
  });

  it('lists every copied ADR once in the index', () => {
    const index = readFileSync(join(root, indexPath), 'utf8');
    const adrs = archival.filter((p) => p.startsWith('docs/adr/mcp/'));
    expect(adrs).toHaveLength(27);
    for (const path of adrs) {
      const name = path.split('/').pop() ?? '';
      expect(index.split(`](${name})`).length - 1, name).toBe(1);
    }
  });
});

function pinnedSha(): string {
  const index = readFileSync(join(root, indexPath), 'utf8');
  return /`([0-9a-f]{40})`/.exec(index)?.[1] ?? '';
}

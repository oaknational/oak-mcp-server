import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const adrDirectory = join(import.meta.dirname, '..', '..', 'docs', 'adr');
const index = readFileSync(join(adrDirectory, 'README.md'), 'utf8');
const adrFiles = readdirSync(adrDirectory).filter((name) => /^\d{4}-.+\.md$/.test(name));

describe('ADR index', () => {
  it('finds the founding records', () => {
    expect(adrFiles.slice(0, 3)).toEqual([
      '0001-repository-topology.md',
      '0002-own-dependencies-publish-on-second-consumer.md',
      '0003-docs-at-root-server-at-mcp.md',
    ]);
  });

  it.each(adrFiles)('lists %s once, as a link', (name) => {
    const links = index.match(new RegExp(`\\]\\(${name.replace('.', '\\.')}\\)`, 'g')) ?? [];
    expect(links).toHaveLength(1);
  });
});

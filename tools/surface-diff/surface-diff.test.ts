import { readFileSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { describe, expect, it } from 'vitest';
import {
  EXPECTED_DIFFERENCES,
  captureSurface,
  diffSurfaces,
  formatReport,
  judgeDifferences,
  normaliseSnapshot,
  parseBaseline,
  type SurfaceSnapshot,
} from './surface-diff.ts';

interface FixtureTool {
  readonly name: string;
  readonly description: string;
  readonly readOnlyHint?: boolean;
}

const BASE_TOOLS: readonly FixtureTool[] = [
  { name: 'fixture-lookup', description: 'Look up a fixture.', readOnlyHint: true },
  { name: 'fixture-retired', description: 'A tool the next server drops.' },
];

async function surfaceOf(
  tools: readonly FixtureTool[],
  version = '1.0.0',
): Promise<SurfaceSnapshot> {
  const server = new McpServer({ name: 'fixture-server', version });
  for (const tool of tools) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        ...(tool.readOnlyHint === undefined
          ? {}
          : { annotations: { readOnlyHint: tool.readOnlyHint } }),
      },
      () => ({ content: [] }),
    );
  }
  server.registerResource(
    'fixture-doc',
    'docs://fixture/readme.md',
    { mimeType: 'text/markdown' },
    () => ({
      contents: [],
    }),
  );
  const client = new Client({ name: 'fixture-client', version: '0.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    return await captureSurface(client);
  } finally {
    await client.close();
  }
}

function report(
  baseline: SurfaceSnapshot,
  current: SurfaceSnapshot,
  expected = EXPECTED_DIFFERENCES,
) {
  return judgeDifferences(diffSurfaces(baseline, current), expected);
}

describe('surface diff', () => {
  it('reports two captures of the same server as identical', async () => {
    const result = report(await surfaceOf(BASE_TOOLS), await surfaceOf(BASE_TOOLS));
    expect(result.unexpected).toEqual([]);
    expect(formatReport(result)).toMatch(/^surface identical\n/);
  });

  it('fails on a tool added to the served surface', async () => {
    const current = await surfaceOf([
      ...BASE_TOOLS,
      { name: 'fixture-extra', description: 'New.' },
    ]);
    const result = report(await surfaceOf(BASE_TOOLS), current);
    expect(result.unexpected).toEqual([
      { kind: 'added', collection: 'tools', id: 'fixture-extra' },
    ]);
    expect(formatReport(result)).toContain('added tool "fixture-extra"');
  });

  it('names the tool and field when a description changes', async () => {
    const changed = BASE_TOOLS.map((tool) =>
      tool.name === 'fixture-lookup' ? { ...tool, description: 'Look up a fixture by id.' } : tool,
    );
    const output = formatReport(report(await surfaceOf(BASE_TOOLS), await surfaceOf(changed)));
    expect(output).toContain('changed tool "fixture-lookup" field description');
    expect(output).toContain('"Look up a fixture by id."');
  });

  it('names the tool and annotation when an annotation changes', async () => {
    const changed = BASE_TOOLS.map((tool) =>
      tool.name === 'fixture-lookup' ? { ...tool, readOnlyHint: false } : tool,
    );
    const output = formatReport(report(await surfaceOf(BASE_TOOLS), await surfaceOf(changed)));
    expect(output).toContain('changed tool "fixture-lookup" field annotations.readOnlyHint');
  });

  it('ignores the server release version', async () => {
    const result = report(
      await surfaceOf(BASE_TOOLS, '1.0.0'),
      await surfaceOf(BASE_TOOLS, '2.3.4'),
    );
    expect(result.unexpected).toEqual([]);
  });

  it('ignores key order and whitespace', () => {
    const empty = { resources: {}, resourceTemplates: {}, prompts: {} };
    const tidy = normaliseSnapshot({
      server: { serverInfo: { name: 'fixture-server', title: 'Fixture' } },
      tools: { 'fixture-lookup': { name: 'fixture-lookup', description: 'Line one.\nLine two.' } },
      ...empty,
    });
    const messy = normaliseSnapshot({
      server: { serverInfo: { title: 'Fixture', name: 'fixture-server' } },
      tools: {
        'fixture-lookup': { description: '  Line one.  \r\nLine two.\n', name: 'fixture-lookup' },
      },
      ...empty,
    });
    expect(diffSurfaces(tidy, messy)).toEqual([]);
  });

  it('accepts a listed expected difference and reports it', async () => {
    const current = await surfaceOf(BASE_TOOLS.filter((tool) => tool.name !== 'fixture-retired'));
    const result = report(await surfaceOf(BASE_TOOLS), current, [
      {
        location: { kind: 'removed', collection: 'tools', id: 'fixture-retired' },
        reason: 'retired on purpose',
      },
    ]);
    expect(result.unexpected).toEqual([]);
    expect(formatReport(result)).toContain(
      'expected difference: removed tool "fixture-retired" (retired on purpose)',
    );
  });

  it('round-trips a snapshot through the baseline file format', async () => {
    const snapshot = await surfaceOf(BASE_TOOLS);
    const text = JSON.stringify({ source: 'fixture', surface: snapshot });
    expect(diffSurfaces(snapshot, parseBaseline(text))).toEqual([]);
  });

  it('keeps every expected removal present in the committed baseline', () => {
    const baseline = parseBaseline(readFileSync(new URL('baseline.json', import.meta.url), 'utf8'));
    for (const { location } of EXPECTED_DIFFERENCES) {
      if (location.kind === 'removed') {
        expect(baseline[location.collection]).toHaveProperty([location.id]);
      }
    }
  });
});

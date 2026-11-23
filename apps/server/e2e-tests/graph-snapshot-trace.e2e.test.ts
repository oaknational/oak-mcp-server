import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { DEFAULT_GRAPH_CORPUS_TTL_MS } from '@oaknational/graph-corpus-sdk/load';
import {
  GRAPH_CORPUS_SCHEMA_VERSION,
  createGraphCorpusSnapshotStore,
  createLocalFileObjectStore,
} from '@oaknational/graph-corpus-sdk/store';
import { fixtureCorpus } from '@oaknational/graph-corpus-sdk/testing';
import { createApp } from '../src/application.js';
import { request } from '../src/test-helpers/loopback-request.js';
import { createFakeHttpObservability } from '../src/test-helpers/observability-fakes.js';
import { getScratchStaticRoot } from '../src/test-helpers/static-root-fixture.js';
import { parseJsonRpcResult, parseSseEnvelope } from './helpers/sse.js';
import { createMockRuntimeConfig } from './helpers/test-config.js';

it('records the graph snapshot used by each request across refresh and cache expiry', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'graph-snapshot-trace-'));
  const setActiveSpanAttribute = vi.fn();
  const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-01T00:00:00Z'));
  try {
    const store = createGraphCorpusSnapshotStore(createLocalFileObjectStore(directory));
    const publish = (downloadedAt: string) =>
      store.write({
        schemaVersion: GRAPH_CORPUS_SCHEMA_VERSION,
        downloadedAt,
        generatedAt: downloadedAt,
        corpus: fixtureCorpus,
      });
    const first = await publish('2026-10-01T00:00:00.000Z');
    const runtimeConfig = createMockRuntimeConfig({
      dangerouslyDisableAuth: true,
      env: { GRAPH_CORPUS_LOCAL_PATH: directory },
    });
    const app = await createApp({
      staticRoot: await getScratchStaticRoot(),
      runtimeConfig,
      observability: { ...createFakeHttpObservability(), setActiveSpanAttribute },
      getWidgetHtml: () => '<!doctype html>',
    });
    const callGraph = async () => {
      const response = await request(app)
        .post('/mcp')
        .set('Host', 'localhost')
        .set('Accept', 'application/json, text/event-stream')
        .send({
          jsonrpc: '2.0',
          id: '1',
          method: 'tools/call',
          params: {
            name: 'get-keyword-graph',
            arguments: { subject: 'maths', keyStage: 'ks2' },
          },
        });
      expect(response.status).toBe(200);
      expect(parseJsonRpcResult(parseSseEnvelope(response.text)).isError).not.toBe(true);
    };

    await callGraph();
    const second = await publish('2026-10-02T00:00:00.000Z');
    await callGraph();
    clock.mockReturnValue(Date.now() + DEFAULT_GRAPH_CORPUS_TTL_MS + 1);
    await callGraph();

    expect(setActiveSpanAttribute.mock.calls).toEqual([
      ['oak.graph.snapshot_key', first.datedKey],
      ['oak.graph.snapshot_key', first.datedKey],
      ['oak.graph.snapshot_key', second.datedKey],
    ]);
  } finally {
    clock.mockRestore();
    await rm(directory, { recursive: true, force: true });
  }
});

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import express, { type Express } from 'express';

import { REFERENCE_PATH } from '../reference/load.ts';
import { importServerModule } from '../reference/server.ts';
import type { Reference } from '../reference/types.ts';

interface SilentLogger {
  readonly [level: string]: () => unknown;
}

interface CoreEndpointsModule {
  readonly initializeCoreEndpoints: (
    app: Express,
    options: {
      readonly runtimeConfig: unknown;
      readonly observability: unknown;
      readonly resourceUrl: string;
      readonly getWidgetHtml: () => string;
    },
    logger: SilentLogger,
  ) => { readonly mcpFactory: () => { readonly server: McpServer } };
}

interface ObservabilityModule {
  readonly createHttpObservability: (
    config: unknown,
  ) => { readonly ok: true; readonly value: unknown } | { readonly ok: false };
}

interface ServedOriginModule {
  readonly resolveServedMcpUrl: (inputs: Record<string, never>) => string;
}

const runtimeConfig = {
  env: {
    OAK_API_KEY: 'docs-reference-key',
    ELASTICSEARCH_URL: 'https://docs-reference.invalid',
    ELASTICSEARCH_API_KEY: 'docs-reference-key',
    CLERK_PUBLISHABLE_KEY: 'pk_test_docs_reference',
    CLERK_SECRET_KEY: 'sk_test_docs_reference',
    SENTRY_MODE: 'off',
  },
  dangerouslyDisableAuth: false,
  useStubTools: true,
  version: '0.0.0-docs-reference',
  versionSource: 'APP_VERSION_OVERRIDE',
  vercelHostnames: [],
} as const;

const silentLogger: SilentLogger = {
  trace: () => undefined,
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  fatal: () => undefined,
  isLevelEnabled: () => false,
  child: () => silentLogger,
};

export async function connectToServer(): Promise<Client> {
  const [{ initializeCoreEndpoints }, { createHttpObservability }, { resolveServedMcpUrl }] =
    await Promise.all([
      importServerModule<CoreEndpointsModule>('app/core-endpoints.ts'),
      importServerModule<ObservabilityModule>('observability/http-observability.ts'),
      importServerModule<ServedOriginModule>('served-origin.ts'),
    ]);
  const observability = createHttpObservability(runtimeConfig);
  if (!observability.ok) {
    throw new Error('The server could not create its observability for the docs reference');
  }
  const { mcpFactory } = initializeCoreEndpoints(
    express(),
    {
      runtimeConfig,
      observability: observability.value,
      resourceUrl: resolveServedMcpUrl({}),
      getWidgetHtml: () => '<html>docs-reference</html>',
    },
    silentLogger,
  );
  const { server } = mcpFactory();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'oak-mcp-docs-reference', version: '0.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

export async function readReference(connect: () => Promise<Client>): Promise<Reference> {
  const client = await connect();
  try {
    const served = client.getServerCapabilities();
    const [{ tools }, { resources }, { resourceTemplates }, { prompts }] = await Promise.all([
      client.listTools(),
      served?.resources ? client.listResources() : { resources: [] },
      served?.resources ? client.listResourceTemplates() : { resourceTemplates: [] },
      served?.prompts ? client.listPrompts() : { prompts: [] },
    ]);
    return {
      tools: tools.map(({ name, title, description, annotations, inputSchema }) => ({
        name,
        title: title ?? annotations?.title,
        description,
        annotations,
        inputSchema,
      })),
      resources: resources.map(({ uri, name, title, description, mimeType }) => ({
        uri,
        name,
        title,
        description,
        mimeType,
      })),
      resourceTemplates: resourceTemplates.map(
        ({ uriTemplate, name, title, description, mimeType }) => ({
          uriTemplate,
          name,
          title,
          description,
          mimeType,
        }),
      ),
      prompts: prompts.map(({ name, title, description, arguments: args }) => ({
        name,
        title,
        description,
        arguments: args,
      })),
    };
  } finally {
    await client.close();
  }
}

if (import.meta.main) {
  try {
    const reference = await readReference(connectToServer);
    await mkdir(dirname(REFERENCE_PATH), { recursive: true });
    await writeFile(REFERENCE_PATH, `${JSON.stringify(reference, null, 2)}\n`);
    console.log(
      `Wrote the docs reference: ${String(reference.tools.length)} tools, ${String(
        reference.resources.length + reference.resourceTemplates.length,
      )} resources, ${String(reference.prompts.length)} prompts`,
    );
  } catch (error) {
    console.error('The docs build needs the server to start, and it did not.', error);
    process.exitCode = 1;
  }
}

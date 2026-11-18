import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { SERVER_PATHS } from './vercel-routing.ts';

interface MicrofrontendsConfig {
  readonly applications: Readonly<
    Record<string, { readonly routing?: readonly { readonly paths: readonly string[] }[] }>
  >;
}

const CONFIG = JSON.parse(
  readFileSync(new URL('../../apps/docs/microfrontends.json', import.meta.url), 'utf8'),
) as MicrofrontendsConfig;

const DOCS_PROJECT = 'oak-mcp-server-docs';
const SERVER_PROJECT = 'oak-mcp-server-function';

describe('apps/docs/microfrontends.json', () => {
  it('names the Vercel projects that infrastructure/project creates', () => {
    expect(Object.keys(CONFIG.applications).toSorted()).toStrictEqual([
      DOCS_PROJECT,
      SERVER_PROJECT,
    ]);
    expect(CONFIG.applications[DOCS_PROJECT]?.routing).toBeUndefined();
  });

  it('routes exactly the paths in server-paths.json to the server', () => {
    // Microfrontends rejects a path that ends in a slash. Its `:path*` sibling already matches it.
    const trailingSlash = SERVER_PATHS.filter((path) => path.endsWith('/'));
    for (const path of trailingSlash) expect(SERVER_PATHS).toContain(`${path}:path*`);

    const routed = CONFIG.applications[SERVER_PROJECT]?.routing?.flatMap(({ paths }) => paths);

    expect(routed).toStrictEqual(SERVER_PATHS.filter((path) => !path.endsWith('/')));
  });
});

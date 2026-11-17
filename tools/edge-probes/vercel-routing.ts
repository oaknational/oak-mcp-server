import { request as forward } from 'node:http';

import serverPaths from './server-paths.json' with { type: 'json' };
import { listen, type StubOrigin } from './stub-origins.ts';

export const SERVER_PATHS: readonly string[] = serverPaths;

export const serverRewrites = (origin: string): VercelConfig => ({
  rewrites: SERVER_PATHS.map((source) => ({ source, destination: `${origin}${source}` })),
});

interface Rewrite {
  readonly source: string;
  readonly destination: string;
}

interface HeaderRule {
  readonly source: string;
  readonly headers: readonly { readonly key: string; readonly value: string }[];
}

export interface VercelConfig {
  readonly trailingSlash?: boolean;
  readonly rewrites?: readonly Rewrite[];
  readonly headers?: readonly HeaderRule[];
}

export type Route =
  | { readonly kind: 'redirect'; readonly location: string }
  | { readonly kind: 'filesystem' }
  | { readonly kind: 'rewrite'; readonly destination: string };

const ACME_CHALLENGE = /^\/\.well-known\/acme-challenge(?:\/|$)/;

/**
 * Vercel compiles each source with path-to-regexp's `strict` and `sensitive` options
 * (`sourceToRegex` in vercel/vercel `packages/routing-utils/src/superstatic.ts`), so a trailing
 * slash is never optional and case matters.
 */
function compileSource(source: string): (path: string) => Map<string, string> | undefined {
  const names: string[] = [];
  const pattern = source
    .split('/')
    .slice(1)
    .map((segment) => {
      const param = /^:(\w+)(\*?)$/.exec(segment);
      if (param === null) {
        if (/[:()*+?]/.test(segment)) throw new Error(`unsupported source segment: ${segment}`);
        return `/${segment.replaceAll('.', '\\.')}`;
      }
      names.push(param[1] ?? '');
      return param[2] === '*' ? '(?:/([^/]+(?:/[^/]+)*))?' : '/([^/]+)';
    })
    .join('');
  const regex = new RegExp(`^${pattern}$`);
  return (path) => {
    const match = regex.exec(path);
    return match === null
      ? undefined
      : new Map(names.map((name, index) => [name, match[index + 1] ?? '']));
  };
}

/**
 * Routes a path in the order Vercel documents for vercel.json: the `trailingSlash` redirect, then
 * a file in the deployment, then the first rewrite whose source matches. Vercel reserves
 * `/.well-known/acme-challenge`, so no rewrite applies there.
 */
export function route(
  config: VercelConfig,
  path: string,
  isFile: (path: string) => boolean,
): Route {
  const last = path.split('/').at(-1) ?? '';
  if (config.trailingSlash === true && !path.endsWith('/') && !last.includes('.')) {
    return { kind: 'redirect', location: `${path}/` };
  }
  if (config.trailingSlash === false && path !== '/' && path.endsWith('/')) {
    return { kind: 'redirect', location: path.slice(0, -1) };
  }
  if (isFile(path) || ACME_CHALLENGE.test(path)) return { kind: 'filesystem' };
  for (const { source, destination } of config.rewrites ?? []) {
    const params = compileSource(source)(path);
    if (params !== undefined) {
      return {
        kind: 'rewrite',
        destination: destination.replace(
          /:(\w+)\*?/g,
          (token, name: string) => params.get(name) ?? token,
        ),
      };
    }
  }
  return { kind: 'filesystem' };
}

export function startVercelFront(
  config: VercelConfig,
  docs: StubOrigin,
  localOriginFor: ReadonlyMap<string, string>,
  isFile: (path: string) => boolean,
): Promise<StubOrigin> {
  return listen((request, response) => {
    const { pathname, search } = new URL(request.url ?? '/', 'http://front');
    const routed = route(config, pathname, isFile);
    if (routed.kind === 'redirect') {
      response.writeHead(308, { location: routed.location }).end();
      return;
    }
    const destination = routed.kind === 'rewrite' ? new URL(routed.destination) : undefined;
    const origin = destination === undefined ? docs.url : localOriginFor.get(destination.origin);
    if (origin === undefined) {
      response.writeHead(502).end();
      return;
    }
    const local = new URL(origin);
    local.pathname = destination?.pathname ?? pathname;
    local.search = search;
    const upstream = forward(
      local,
      { method: request.method, headers: { ...request.headers, host: local.host } },
      (answer) => {
        response.writeHead(answer.statusCode ?? 502, answer.headers);
        answer.pipe(response);
      },
    );
    upstream.on('error', () => response.writeHead(502).end());
    request.pipe(upstream);
  });
}

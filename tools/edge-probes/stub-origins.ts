import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface StubOrigin {
  readonly url: string;
  readonly requests: readonly string[];
  close(): Promise<void>;
}

type Handler = (request: IncomingMessage, response: ServerResponse) => void;

const DOCS_CSP = `<meta http-equiv="Content-Security-Policy" content="default-src 'self'"/>`;
const STATIC_TREE = /^(?:\/mcp)?\/(?:carousel|favicons|oak-ds|oak-assets)\/.+\.(png|css|ico)$/;
const STATIC_TYPES: Readonly<Record<string, string>> = {
  png: 'image/png',
  css: 'text/css; charset=utf-8',
  ico: 'image/vnd.microsoft.icon',
};
const JSON_PATHS = new Set([
  '/healthz',
  '/mcp/healthz',
  '/.well-known/oauth-protected-resource',
  '/.well-known/oauth-protected-resource/mcp',
  '/.well-known/oauth-authorization-server',
]);
const TEXT_PATHS = new Set(['/robots.txt', '/.well-known/openai-apps-challenge']);

function send(response: ServerResponse, status: number, type: string, body: string): void {
  response.writeHead(status, { 'content-type': type }).end(body);
}

const expressDefaultNotFound = (method: string, path: string): string =>
  `<pre>Cannot ${method} ${path}</pre>`;

function json(response: ServerResponse, status: number): void {
  send(response, status, 'application/json; charset=utf-8', '{}');
}

const serverHandler: Handler = (request, response) => {
  const { pathname } = new URL(request.url ?? '/', 'http://stub');
  const accept = request.headers.accept ?? '';
  const method = request.method ?? 'GET';
  if (pathname === '/mcp' || pathname === '/mcp/') {
    if (
      method === 'POST' &&
      accept.includes('application/json') &&
      accept.includes('text/event-stream')
    ) {
      json(response, 401);
    } else {
      json(response, method === 'GET' && accept.includes('text/event-stream') ? 405 : 406);
    }
  } else if (JSON_PATHS.has(pathname)) {
    json(response, 200);
  } else if (TEXT_PATHS.has(pathname)) {
    send(response, 200, 'text/plain; charset=utf-8', 'stub');
  } else if (pathname === '/oauth/authorize') {
    response.writeHead(307, { location: 'https://auth.invalid/oauth/authorize' }).end();
  } else if (/^\/assets\/download\/[^/]+\/[^/]+$/.test(pathname)) {
    json(response, 400);
  } else if (pathname === '/api/cron/refresh-graph') {
    json(response, 401);
  } else {
    const extension = STATIC_TREE.exec(pathname)?.[1];
    if (extension === undefined) {
      send(response, 404, 'text/html; charset=utf-8', expressDefaultNotFound(method, pathname));
    } else {
      send(response, 200, STATIC_TYPES[extension] ?? 'application/octet-stream', 'stub');
    }
  }
};

function docsHandler(pages: ReadonlySet<string>): Handler {
  return (request, response) => {
    const { pathname } = new URL(request.url ?? '/', 'http://stub');
    const found = pages.has(pathname);
    send(
      response,
      found ? 200 : 404,
      'text/html; charset=utf-8',
      `<html><head>${DOCS_CSP}</head><body>${found ? pathname : 'Page not found'}</body></html>`,
    );
  };
}

async function listen(handler: Handler): Promise<StubOrigin> {
  const requests: string[] = [];
  const server: Server = createServer((request, response) => {
    requests.push(new URL(request.url ?? '/', 'http://stub').pathname);
    handler(request, response);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${String(port)}`,
    requests,
    close: () =>
      new Promise((resolve) => {
        server.close(() => {
          resolve();
        });
      }),
  };
}

export const startServerStub = (): Promise<StubOrigin> => listen(serverHandler);

export const startDocsStub = (pages: Iterable<string> = ['/', '/tools/']): Promise<StubOrigin> =>
  listen(docsHandler(new Set(pages)));

import { readFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { extname, join, normalize } from 'node:path';

const OUT_DIR = new URL('../out/', import.meta.url).pathname;
const CSP_META = /<meta http-equiv="Content-Security-Policy" content="([^"]*)"/;

const TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

interface Loaded {
  readonly status: 200 | 404;
  readonly path: string;
  readonly body: Buffer;
}

async function load(urlPath: string): Promise<Loaded> {
  const clean = normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[/\\])+/, '');
  const candidates = clean.endsWith('/')
    ? [join(clean, 'index.html')]
    : [clean, join(clean, 'index.html')];
  for (const candidate of candidates) {
    const body = await readFile(join(OUT_DIR, candidate)).catch(() => null);
    if (body !== null) return { status: 200, path: candidate, body };
  }
  return { status: 404, path: '404.html', body: await readFile(join(OUT_DIR, '404.html')) };
}

export function createPreviewServer(): Server {
  return createServer((request, response) => {
    const { pathname } = new URL(request.url ?? '/', 'http://localhost');
    load(pathname).then(
      ({ status, path, body }) => {
        const headers: Record<string, string> = {
          ...SECURITY_HEADERS,
          'Content-Type': TYPES[extname(path)] ?? 'application/octet-stream',
        };
        const policy =
          extname(path) === '.html' ? CSP_META.exec(body.toString('utf8'))?.[1] : undefined;
        if (policy !== undefined) headers['Content-Security-Policy'] = policy;
        response.writeHead(status, headers).end(request.method === 'HEAD' ? undefined : body);
      },
      () => {
        response
          .writeHead(500)
          .end('Build the site first: pnpm --filter @oaknational/mcp-docs build');
      },
    );
  });
}

if (import.meta.main) {
  const port = Number(process.env['PORT'] ?? 4173);
  createPreviewServer().listen(port, () => {
    console.log(`Docs preview at http://localhost:${String(port)}/`);
  });
}

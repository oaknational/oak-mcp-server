import { createHash } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createPreviewServer } from '../scripts/serve.mts';

const INDEX = new URL('../out/index.html', import.meta.url);
const PATHS = ['/', '/page-that-does-not-exist/', '/_next/static/missing.js'] as const;

let server: Server;
let origin: string;

beforeAll(async () => {
  await access(INDEX).catch(() => {
    throw new Error('Build the docs first: pnpm --filter @oaknational/mcp-docs build');
  });
  server = createPreviewServer();
  await new Promise<void>((resolve) => server.listen(0, resolve));
  origin = `http://localhost:${String((server.address() as AddressInfo).port)}`;
});

afterAll(() => {
  server.close();
});

describe('docs response headers', () => {
  it.each(PATHS)('sends a strict CSP and no cookie for %s', async (path) => {
    const response = await fetch(origin + path);
    expect(response.headers.get('set-cookie')).toBeNull();
    if (response.headers.get('content-type')?.includes('text/html')) {
      const csp = response.headers.get('content-security-policy') ?? '';
      expect(csp).toMatch(/^default-src 'self'/);
      expect(csp).not.toMatch(/unsafe-inline|unsafe-eval|https?:\/\//);
    }
  });

  it('allows every inline script and style the home page ships, and no others', async () => {
    const response = await fetch(`${origin}/`);
    const csp = response.headers.get('content-security-policy') ?? '';
    const html = await response.text();
    const hashes = (tag: string) =>
      [...html.matchAll(new RegExp(`<${tag}(?![^>]*\\ssrc=)[^>]*>([\\s\\S]*?)</${tag}>`, 'g'))].map(
        (match) =>
          `'sha256-${createHash('sha256')
            .update(match[1] ?? '')
            .digest('base64')}'`,
      );
    const directive = (name: string) =>
      csp.split('; ').find((part) => part.startsWith(`${name} `)) ?? '';
    expect(hashes('script').length).toBeGreaterThan(0);
    for (const hash of hashes('script')) expect(directive('script-src')).toContain(hash);
    for (const hash of hashes('style')) expect(directive('style-src')).toContain(hash);
  });

  it('serves unknown paths with status 404', async () => {
    expect((await fetch(`${origin}/page-that-does-not-exist/`)).status).toBe(404);
  });

  it('ships no third-party origin in any exported page', async () => {
    const html = await readFile(INDEX, 'utf8');
    const external = [
      ...html.matchAll(/<(?:script|link|img|iframe)[^>]+(?:src|href)="(https?:\/\/[^"]+)"/g),
    ];
    expect(external.map((match) => match[1])).toEqual([]);
  });
});

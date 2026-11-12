import { setTimeout as sleep } from 'node:timers/promises';

const PREVIEW_HOST_SUFFIX = '.vercel.thenational.academy';

interface Check {
  readonly method: 'GET' | 'POST';
  readonly path: string;
  readonly body?: string;
  readonly verify: (response: Response) => string | undefined;
}

function expectStatus(expected: number) {
  return (response: Response): string | undefined =>
    response.status === expected
      ? undefined
      : `expected ${String(expected)}, got ${String(response.status)}`;
}

const CHECKS: readonly Check[] = [
  { method: 'GET', path: '/healthz', verify: expectStatus(200) },
  { method: 'GET', path: '/mcp/healthz', verify: expectStatus(200) },
  { method: 'GET', path: '/.well-known/oauth-protected-resource/mcp', verify: expectStatus(200) },
  {
    method: 'POST',
    path: '/mcp',
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    verify: (response) =>
      expectStatus(401)(response) ??
      (response.headers.has('www-authenticate') ? undefined : '401 without WWW-Authenticate'),
  },
];

export interface ProbeOptions {
  readonly baseUrl: URL;
  readonly bypassSecret?: string | undefined;
  readonly timeoutMs?: number;
  readonly attempts?: number;
  readonly retryDelayMs?: number;
  readonly log?: (line: string) => void;
}

export function parsePreviewUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('the deployment URL is not a valid URL');
  }
  const bare =
    url.protocol === 'https:' &&
    url.username === '' &&
    url.password === '' &&
    url.port === '' &&
    url.pathname === '/' &&
    url.search === '' &&
    url.hash === '';
  if (!bare || !url.hostname.endsWith(PREVIEW_HOST_SUFFIX)) {
    throw new Error(`the deployment URL is not a bare https://*${PREVIEW_HOST_SUFFIX} origin`);
  }
  return url;
}

async function runCheck(check: Check, options: ProbeOptions, timeoutMs: number) {
  const headers: Record<string, string> = {
    accept: 'application/json, text/event-stream',
    'content-type': 'application/json',
  };
  if (options.bypassSecret !== undefined) {
    headers['x-vercel-protection-bypass'] = options.bypassSecret;
  }
  try {
    const response = await fetch(new URL(check.path, options.baseUrl), {
      method: check.method,
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
      ...(check.body === undefined ? {} : { body: check.body }),
    });
    await response.body?.cancel();
    return check.verify(response);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      return `timed out after ${String(timeoutMs)} ms`;
    }
    return `request failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/** Retries the whole set, because a fresh deployment can still be cold when Vercel reports success. */
export async function probe(options: ProbeOptions): Promise<boolean> {
  const { timeoutMs = 10_000, attempts = 10, retryDelayMs = 15_000, log = () => {} } = options;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let passed = true;
    for (const check of CHECKS) {
      const failure = await runCheck(check, options, timeoutMs);
      log(
        `attempt ${String(attempt)}/${String(attempts)} ${check.method} ${check.path}: ${failure ?? 'ok'}`,
      );
      passed &&= failure === undefined;
    }
    if (passed) {
      return true;
    }
    if (attempt < attempts) {
      await sleep(retryDelayMs);
    }
  }
  return false;
}

if (import.meta.main) {
  try {
    const passed = await probe({
      baseUrl: parsePreviewUrl(process.env['PREVIEW_URL'] ?? ''),
      bypassSecret: process.env['VERCEL_AUTOMATION_BYPASS_SECRET'] || undefined,
      log: (line) => process.stdout.write(`${line}\n`),
    });
    process.stdout.write(passed ? 'The preview serves.\n' : 'The preview does not serve.\n');
    process.exitCode = passed ? 0 : 1;
  } catch (error) {
    process.stderr.write(
      `preview-probe: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}

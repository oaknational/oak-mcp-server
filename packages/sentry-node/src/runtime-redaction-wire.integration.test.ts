import { getActiveSpanContextSnapshot } from '@oaknational/observability';
import { trace } from '@opentelemetry/api';
import * as Sentry from '@sentry/node';
import { afterEach, describe, expect, it } from 'vitest';
import { createSentryInitOptions } from './runtime-sdk.js';
import type { SentryLiveConfig } from './types.js';

const TOKEN = 'wire-probe-bearer-token-7f3a';
const OAUTH_CODE = 'wire-probe-oauth-code-9c1e';
const EMAIL = ['wire-probe-teacher', 'example.invalid'].join('@');
const CALLBACK_URL = `https://mcp.example.invalid/oauth/callback?code=${OAUTH_CODE}&state=s1`;

const liveConfig: SentryLiveConfig = {
  mode: 'sentry',
  dsn: 'https://key@localhost/123',
  environment: 'test',
  environmentSource: 'SENTRY_ENVIRONMENT_OVERRIDE',
  release: 'test-1.0.0',
  releaseSource: 'application_version',
  tracesSampleRate: 1,
  enableLogs: false,
  sendDefaultPii: false,
  debug: false,
};

interface EnvelopeItem {
  readonly type: string;
  readonly payload: string;
}

function initWithCapturingTransport(): { readonly envelopes: string[] } {
  const envelopes: string[] = [];
  Sentry.init({
    ...createSentryInitOptions(liveConfig, { serviceName: 'wire-probe' }),
    transport: (transportOptions) =>
      Sentry.createTransport(transportOptions, (request) => {
        envelopes.push(
          typeof request.body === 'string' ? request.body : new TextDecoder().decode(request.body),
        );
        return Promise.resolve({ statusCode: 200 });
      }),
  });
  return { envelopes };
}

function envelopeItems(envelope: string): EnvelopeItem[] {
  const [, ...lines] = envelope.split('\n').filter((line) => line !== '');
  const items: EnvelopeItem[] = [];
  for (let index = 0; index + 1 < lines.length; index += 2) {
    const header = JSON.parse(lines[index] ?? '{}') as { readonly type: string };
    items.push({ type: header.type, payload: lines[index + 1] ?? '' });
  }
  return items;
}

afterEach(async () => {
  await Sentry.close(2_000);
});

describe('Sentry redaction on the wire', () => {
  it('keeps Bearer tokens and OAuth codes out of every span and event the SDK sends', async () => {
    const { envelopes } = initWithCapturingTransport();

    Sentry.startSpan({ name: 'GET /oauth/callback', op: 'http.server' }, () => {
      Sentry.startSpan(
        {
          name: `GET ${CALLBACK_URL}`,
          op: 'http.client',
          attributes: { authorization: `Bearer ${TOKEN}`, 'http.url': CALLBACK_URL },
        },
        () => undefined,
      );
    });
    Sentry.captureException(new Error(`upstream rejected Bearer ${TOKEN}`));
    Sentry.captureMessage(`callback failed at ${CALLBACK_URL}`);
    await Sentry.flush(2_000);

    for (const envelope of envelopes) {
      expect(envelope).not.toContain(TOKEN);
      expect(envelope).not.toContain(OAUTH_CODE);
    }

    const items = envelopes.flatMap(envelopeItems);
    const transaction = items.find((item) => item.type === 'transaction');
    expect(transaction?.payload).toContain('"op":"http.client"');
    expect(transaction?.payload).toContain('"authorization":"[REDACTED]"');
    expect(items.filter((item) => item.type === 'event')).toHaveLength(2);
  });

  it('redacts structured span attributes that bypass the attribute type', async () => {
    const { envelopes } = initWithCapturingTransport();
    const structured = {
      request: { authorization: `Bearer ${TOKEN}` },
      redirects: { history: [CALLBACK_URL] },
    };

    Sentry.startSpan({ name: 'POST /mcp', op: 'http.server' }, () => {
      Sentry.startSpan({ name: 'upstream', op: 'http.client' }, (span) => {
        span.setAttributes(structured as unknown as Parameters<typeof span.setAttributes>[0]);
      });
    });
    await Sentry.flush(2_000);

    const transaction = envelopes
      .flatMap(envelopeItems)
      .find((item) => item.type === 'transaction');
    expect(transaction?.payload).toContain('"op":"http.client"');
    for (const envelope of envelopes) {
      expect(envelope).not.toContain(TOKEN);
      expect(envelope).not.toContain(OAUTH_CODE);
    }
  });

  it('keeps mixed-text tokens, DSC transaction names and span emails out of the whole envelope', async () => {
    const { envelopes } = initWithCapturingTransport();

    Sentry.startSpan({ name: `GET ${CALLBACK_URL}`, op: 'http.server' }, () => {
      Sentry.startSpan({ name: 'lookup user', op: 'db' }, (span) => {
        span.setAttribute('user.email', EMAIL);
      });
      Sentry.captureException(new Error(`boom Bearer ${TOKEN} ${CALLBACK_URL}`));
    });
    await Sentry.flush(2_000);

    const items = envelopes.flatMap(envelopeItems);
    expect(items.map((item) => item.type)).toEqual(
      expect.arrayContaining(['event', 'transaction']),
    );
    for (const envelope of envelopes) {
      expect(envelope).not.toContain(TOKEN);
      expect(envelope).not.toContain(OAUTH_CODE);
      expect(envelope).not.toContain(EMAIL);
    }
  });

  it('captures and redacts spans created through the OpenTelemetry API', async () => {
    const { envelopes } = initWithCapturingTransport();
    const tracer = trace.getTracer('wire-probe', '0.0.0');

    const activeTraceId = tracer.startActiveSpan('POST /mcp', (root) => {
      const traceId = getActiveSpanContextSnapshot()?.traceId;
      tracer.startActiveSpan('oak.upstream.fetch', (child) => {
        child.setAttributes({ authorization: `Bearer ${TOKEN}`, 'http.url': CALLBACK_URL });
        child.end();
      });
      root.end();
      return traceId;
    });
    await Sentry.flush(2_000);

    for (const envelope of envelopes) {
      expect(envelope).not.toContain(TOKEN);
      expect(envelope).not.toContain(OAUTH_CODE);
    }

    const transaction = envelopes
      .flatMap(envelopeItems)
      .find((item) => item.type === 'transaction');
    expect(transaction?.payload).toContain('"description":"oak.upstream.fetch"');
    expect(transaction?.payload).toContain('"authorization":"[REDACTED]"');
    expect(activeTraceId).toMatch(/^[0-9a-f]{32}$/);
    expect(transaction?.payload).toContain(`"trace_id":"${activeTraceId ?? 'none'}"`);
  });
});

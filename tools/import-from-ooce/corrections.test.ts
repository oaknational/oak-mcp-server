import {
  createSentryConfig,
  createSentryInitOptions,
  type SentryErrorEvent,
} from '@oaknational/sentry-node';
import { describe, expect, it } from 'vitest';

function beforeSend(): (event: SentryErrorEvent) => Promise<SentryErrorEvent | null> {
  const config = createSentryConfig({
    APP_VERSION: '1.0.0-test',
    APP_VERSION_SOURCE: 'APP_VERSION_OVERRIDE',
    SENTRY_MODE: 'sentry',
    SENTRY_DSN: 'https://key@localhost/123',
    SENTRY_TRACES_SAMPLE_RATE: '0',
  });
  if (!config.ok || config.value.mode !== 'sentry') {
    throw new Error(`Expected a live Sentry config: ${JSON.stringify(config)}`);
  }
  const hook = createSentryInitOptions(config.value, { serviceName: 'oak-http' }).beforeSend;
  if (hook === undefined) {
    throw new Error('Expected a beforeSend hook');
  }
  return async (event) => hook(event, {});
}

async function redactedRequestData(data: string): Promise<unknown> {
  const event = await beforeSend()({ type: undefined, request: { data } });
  return event?.request?.data;
}

describe('Sentry request.data redaction (manifest edits to redaction-form.ts and redaction-url.ts)', () => {
  it.each([
    [
      'a raw URL value',
      'grant_type=authorization_code&code=fixture-code&redirect_uri=https://client.example/callback',
      'grant_type=authorization_code&code=%5BREDACTED%5D&redirect_uri=https%3A%2F%2Fclient.example%2Fcallback',
    ],
    [
      'a raw URL value with a query',
      'grant_type=authorization_code&code=fixture-code&redirect_uri=https://client.example/callback?tab=1',
      'grant_type=authorization_code&code=%5BREDACTED%5D&redirect_uri=https%3A%2F%2Fclient.example%2Fcallback%3Ftab%3D1',
    ],
    [
      'a raw URL value whose query holds a sensitive parameter',
      'code=fixture-code&redirect_uri=https://client.example/callback?state=fixture-state',
      'code=%5BREDACTED%5D&redirect_uri=https%3A%2F%2Fclient.example%2Fcallback%3Fstate%3Dfixture-state',
    ],
    [
      'a URL-encoded URL value',
      'grant_type=authorization_code&code=fixture-code&redirect_uri=https%3A%2F%2Fclient.example%2Fcallback',
      'grant_type=authorization_code&code=%5BREDACTED%5D&redirect_uri=https%3A%2F%2Fclient.example%2Fcallback',
    ],
  ])('redacts the code in a form body with %s', async (_, body, redacted) => {
    expect(await redactedRequestData(body)).toBe(redacted);
  });

  it('redacts the code in a standalone URL query', async () => {
    expect(
      await redactedRequestData('https://client.example/callback?code=fixture-code&tab=1'),
    ).toBe('https://client.example/callback?code=%5BREDACTED%5D&tab=1');
  });

  it('leaves a URL with no sensitive parameters unchanged', async () => {
    expect(await redactedRequestData('https://client.example/callback?tab=1')).toBe(
      'https://client.example/callback?tab=1',
    );
  });
});

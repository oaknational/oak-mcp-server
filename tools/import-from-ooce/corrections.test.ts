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

describe('Sentry request.data redaction (supplied redaction-params.ts)', () => {
  it.each([
    [
      'grant_type=authorization_code&code=fixture-code&redirect_uri=https://client.example/callback',
      'grant_type=authorization_code&code=%5BREDACTED%5D&redirect_uri=https://client.example/callback',
    ],
    [
      'grant_type=authorization_code&code=fixture-code&redirect_uri=https://client.example/callback?tab=1',
      'grant_type=authorization_code&code=%5BREDACTED%5D&redirect_uri=https://client.example/callback?tab=1',
    ],
    [
      'code=fixture-code&redirect_uri=https://client.example/callback?state=fixture-state',
      'code=%5BREDACTED%5D&redirect_uri=https://client.example/callback?state=%5BREDACTED%5D',
    ],
    [
      'grant_type=authorization_code&code=fixture-code&redirect_uri=https%3A%2F%2Fclient.example%2Fcallback',
      'grant_type=authorization_code&code=%5BREDACTED%5D&redirect_uri=https%3A%2F%2Fclient.example%2Fcallback',
    ],
    [
      'redirect_uri=https%3A%2F%2Fclient.example%2Fcallback%3Fcode%3Dfixture-code',
      'redirect_uri=https%3A%2F%2Fclient.example%2Fcallback%3Fcode%3D%255BREDACTED%255D',
    ],
    [
      'https://client.example/callback?code=fixture-code&tab=1',
      'https://client.example/callback?code=%5BREDACTED%5D&tab=1',
    ],
    [
      'https://client.example/callback#access_token=fixture-code&tab=1',
      'https://client.example/callback#access_token=%5BREDACTED%5D&tab=1',
    ],
    [
      'https://user:fixture-password@localhost/callback?tab=1',
      'https://%5BREDACTED%5D:%5BREDACTED%5D@localhost/callback?tab=1',
    ],
    ['/callback/a=b&c=d?code=fixture-code&tab=1', '/callback/a=b&c=d?code=%5BREDACTED%5D&tab=1'],
    ['./callback/a=b&c=d?code=fixture-code&tab=1', './callback/a=b&c=d?code=%5BREDACTED%5D&tab=1'],
    [
      '../callback/a=b&c=d?code=fixture-code&tab=1',
      '../callback/a=b&c=d?code=%5BREDACTED%5D&tab=1',
    ],
    ['callback/a=b?code=fixture-code', 'callback/a=b?code=%5BREDACTED%5D'],
    ['a/b=c&d?code=fixture-code', 'a/b=c&d?code=%5BREDACTED%5D'],
    ['cb=1?code=fixture-code', 'cb=1?code=%5BREDACTED%5D'],
    ['.hidden/a=b?code=fixture-code', '.hidden/a=b?code=%5BREDACTED%5D'],
    ['x=1&next=/cb?code=fixture-code', 'x=1&next=/cb?code=%5BREDACTED%5D'],
    ['a=b&code=fixture-code&c=d', 'a=b&code=%5BREDACTED%5D&c=d'],
  ])('redacts %s', async (input, redacted) => {
    expect(await redactedRequestData(input)).toBe(redacted);
  });

  it.each([
    'https://client.example/callback?tab=1',
    'Is x=1? Yes, and y=2 & z=3.',
    '{"query":"a=b?c=d","n":1}',
    'subject=maths&key_stage=ks3&page=2',
    'note=a+b&other=a%20b',
  ])('leaves %s unchanged', async (input) => {
    expect(await redactedRequestData(input)).toBe(input);
  });
});

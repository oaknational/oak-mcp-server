import { describe, expect, it } from 'vitest';
import {
  REDACTED_VALUE,
  redactHeaderRecord,
  redactHeaderValue,
  redactTelemetryObject,
  redactTelemetryValue,
} from './redaction.js';

describe('redactTelemetryValue', () => {
  it('redacts nested secrets by key name', () => {
    const value = redactTelemetryObject({
      headers: {
        authorization: 'Bearer abc123',
      },
      payload: {
        nested: {
          refresh_token: 'refresh-secret',
        },
      },
    });

    expect(value).toStrictEqual({
      headers: {
        authorization: REDACTED_VALUE,
      },
      payload: {
        nested: {
          refresh_token: REDACTED_VALUE,
        },
      },
    });
  });

  it('redacts sensitive query-string parameters inside URLs', () => {
    expect(
      redactTelemetryValue(
        'https://example.test/callback?code=secret-code&state=opaque-state&safe=value',
      ),
    ).toBe('https://example.test/callback?code=%5BREDACTED%5D&state=%5BREDACTED%5D&safe=value');
  });

  it('redacts credentials embedded in URLs', () => {
    expect(redactTelemetryValue('https://user:secret@localhost/callback?safe=value')).toBe(
      'https://%5BREDACTED%5D:%5BREDACTED%5D@localhost/callback?safe=value',
    );
  });

  it('redacts CLI-style embedded secret arguments in strings', () => {
    expect(redactTelemetryValue('--api-key=super-secret --subject=maths')).toBe(
      '--api-key=[REDACTED] --subject=maths',
    );
  });

  it('redacts a Bearer token and a URL query in the same free text', () => {
    expect(
      redactTelemetryValue('boom Bearer abc123 https://example.test/callback?code=secret-code'),
    ).toBe('boom Bearer [REDACTED] https://example.test/callback?code=%5BREDACTED%5D');
  });

  it('redacts a multi-word value in a form-encoded payload in full', () => {
    expect(redactTelemetryValue('password=correct horse battery staple&safe=ok')).toBe(
      'password=%5BREDACTED%5D&safe=ok',
    );
  });

  it('redacts a multi-word form value whose words repeat or are symbols', () => {
    expect(redactTelemetryValue('password=open sesame&hint=sesame')).toBe(
      'password=%5BREDACTED%5D&hint=sesame',
    );
    expect(redactTelemetryValue('password=hunter !!$$&safe=ok')).toBe(
      'password=%5BREDACTED%5D&safe=ok',
    );
  });

  it('redacts a Bearer token before a URL query that has text after it', () => {
    expect(redactTelemetryValue('boom Bearer abc123 /callback?code=secret-code retrying')).toBe(
      'boom Bearer [REDACTED] /callback?code=%5BREDACTED%5D',
    );
  });

  it('redacts multi-word URL credentials in full', () => {
    expect(redactTelemetryValue('https://alice:correct horse@localhost/callback?safe=ok')).toBe(
      'https://%5BREDACTED%5D:%5BREDACTED%5D@localhost/callback?safe=ok',
    );
  });

  it('redacts email addresses by key name', () => {
    const email = ['teacher', 'example.test'].join('@');
    expect(redactTelemetryObject({ 'user.email': email, contactEmail: email })).toStrictEqual({
      'user.email': REDACTED_VALUE,
      contactEmail: REDACTED_VALUE,
    });
  });

  it('redacts arrays recursively', () => {
    expect(
      redactTelemetryValue([
        {
          token: 'abc',
        },
        'Bearer xyz',
      ]),
    ).toStrictEqual([
      {
        token: REDACTED_VALUE,
      },
      'Bearer [REDACTED]',
    ]);
  });

  it('redacts OAuth code and code_verifier by key name', () => {
    const value = redactTelemetryObject({
      code: 'authorization-code-value',
      code_verifier: 'pkce-verifier-secret',
      grant_type: 'authorization_code',
    });

    expect(value).toStrictEqual({
      code: REDACTED_VALUE,
      code_verifier: REDACTED_VALUE,
      grant_type: 'authorization_code',
    });
  });

  it('redacts OAuth assertion credentials by key name', () => {
    const value = redactTelemetryObject({
      assertion: 'jwt-bearer-credential',
      client_assertion: 'signed-client-jwt',
      client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    });

    expect(value).toStrictEqual({
      assertion: REDACTED_VALUE,
      client_assertion: REDACTED_VALUE,
      client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    });
  });

  it('redacts OAuth state and nonce by key name', () => {
    const value = redactTelemetryObject({
      state: 'opaque-state',
      nonce: 'random-nonce',
      grant_type: 'authorization_code',
    });

    expect(value).toStrictEqual({
      state: REDACTED_VALUE,
      nonce: REDACTED_VALUE,
      grant_type: 'authorization_code',
    });
  });

  it('redacts sensitive fields inside OAuth form-encoded payload strings', () => {
    expect(
      redactTelemetryValue(
        'grant_type=authorization_code&code=secret-code&code_verifier=secret-verifier&client_id=oak-client&state=opaque-state&nonce=random-nonce',
      ),
    ).toBe(
      'grant_type=authorization_code&code=%5BREDACTED%5D&code_verifier=%5BREDACTED%5D&client_id=oak-client&state=%5BREDACTED%5D&nonce=%5BREDACTED%5D',
    );
  });

  it('redacts token-bearing OAuth form-encoded payload strings', () => {
    expect(
      redactTelemetryValue(
        'access_token=secret-access&refresh_token=secret-refresh&id_token=secret-id&client_assertion=signed-client-jwt&assertion=jwt-bearer-credential&client_secret=top-secret',
      ),
    ).toBe(
      'access_token=%5BREDACTED%5D&refresh_token=%5BREDACTED%5D&id_token=%5BREDACTED%5D&client_assertion=%5BREDACTED%5D&assertion=%5BREDACTED%5D&client_secret=%5BREDACTED%5D',
    );
  });

  it.each([
    'Is x=1 the answer? Maybe y=2 is better.',
    '{"grant_type":"authorization_code","n":1}',
    'grant_type=authorization_code&client_id=abc&scope=read',
    'client_id=abc&redirect_uri=https://client.example/cb?x=1',
    'next=/cb?page=2&sort=asc',
    'a risk-free change',
    'ask-me-anything-about-this-lesson-plan',
    'task-0123456789abcdefghijklmnop finished',
    'header starts eyJ and stops',
    'version eyJ.1.2 loaded',
    'Authorization: Bearer',
    'cookie consent given',
    'pwd is /srv/app',
  ])('returns the clean input %j unchanged', (input) => {
    expect(redactTelemetryValue(input)).toBe(input);
  });

  it('redacts nonce in URL query strings', () => {
    expect(
      redactTelemetryValue(
        'https://auth.example.test/authorize?nonce=random-nonce-value&response_type=code',
      ),
    ).toBe('https://auth.example.test/authorize?nonce=%5BREDACTED%5D&response_type=code');
  });

  it('redacts sensitive OAuth values inside form-encoded payload strings', () => {
    expect(
      redactTelemetryValue(
        'grant_type=authorization_code&code=secret-code&code_verifier=pkce-secret&client_id=oak-client&state=opaque-state&nonce=random-nonce&client_assertion=signed-client-jwt',
        'data',
      ),
    ).toBe(
      'grant_type=authorization_code&code=%5BREDACTED%5D&code_verifier=%5BREDACTED%5D&client_id=oak-client&state=%5BREDACTED%5D&nonce=%5BREDACTED%5D&client_assertion=%5BREDACTED%5D',
    );
  });
});

describe('redactTelemetryObject credential-barrier percent-encoding (MCP-693)', () => {
  const CANARY = 'CANARY-SECRET-TOKEN-99887766';

  function serialisedMsg(msg: string): string {
    return JSON.stringify(redactTelemetryObject({ msg }));
  }

  it('redacts a Bearer credential separated by a literal space', () => {
    const serialised = serialisedMsg(`Authorization: Bearer ${CANARY}`);
    expect(serialised).not.toContain(CANARY);
  });

  it('redacts a Bearer credential whose separator is percent-encoded', () => {
    const serialised = serialisedMsg(`Authorization: Bearer%20${CANARY}`);
    expect(serialised).not.toContain(CANARY);
  });

  it('redacts a percent-encoded Bearer credential embedded in a URL path', () => {
    const serialised = serialisedMsg(`https://api.example.com/Bearer%20${CANARY}`);
    expect(serialised).not.toContain(CANARY);
  });

  it('redacts a Bearer credential that appears alongside an unrelated URL', () => {
    const serialised = serialisedMsg(`Bearer ${CANARY} see https://example.test/docs`);
    expect(serialised).not.toContain(CANARY);
  });

  it('redacts a Bearer credential inside a URL query string', () => {
    const serialised = serialisedMsg(`https://example.test/path?info=Bearer ${CANARY}`);
    expect(serialised).not.toContain(CANARY);
  });

  it('redacts a Bearer credential inside a URL fragment', () => {
    const serialised = serialisedMsg(`https://example.test/path#frag=Bearer ${CANARY}`);
    expect(serialised).not.toContain(CANARY);
  });

  it('redacts a key=value credential whose leading separator is percent-encoded', () => {
    const serialised = serialisedMsg(`log line: foo%20token=${CANARY} extra`);
    expect(serialised).not.toContain(CANARY);
  });
});

describe('redactHeaderValue', () => {
  it('fully redacts sensitive header values', () => {
    expect(redactHeaderValue('authorization', 'Bearer abc123')).toBe(REDACTED_VALUE);
    expect(redactHeaderValue('x-api-key', 'secret')).toBe(REDACTED_VALUE);
  });

  it('partially redacts IP-like forwarding headers', () => {
    expect(redactHeaderValue('x-forwarded-for', '203.0.113.195')).toBe('203.....195');
  });
});

describe('redactHeaderRecord', () => {
  it('preserves safe headers while redacting sensitive ones', () => {
    expect(
      redactHeaderRecord({
        accept: 'application/json',
        authorization: 'Bearer secret',
      }),
    ).toStrictEqual({
      accept: 'application/json',
      authorization: REDACTED_VALUE,
    });
  });
});

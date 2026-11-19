import { describe, expect, it } from 'vitest';
import { redactTelemetryValue } from './redaction.js';

const HIDDEN_ON_MAIN_AT_82F928B: readonly (readonly [string, readonly string[]])[] = [
  [
    'https://example.test/callback?code=secret-code&state=opaque-state&safe=value',
    ['secret', 'opaque'],
  ],
  ['https://user:secret@localhost/callback?safe=value', ['user', 'secret']],
  ['--api-key=super-secret --subject=maths', ['super', 'secret']],
  ['Bearer xyz', ['xyz']],
  [
    'grant_type=authorization_code&code=secret-code&code_verifier=secret-verifier&client_id=oak-client&state=opaque-state&nonce=random-nonce',
    ['secret', 'opaque', 'random'],
  ],
  [
    'access_token=secret-access&refresh_token=secret-refresh&id_token=secret-id&client_assertion=signed-client-jwt&assertion=jwt-bearer-credential&client_secret=top-secret',
    ['signed', 'jwt', 'bearer', 'credential', 'top'],
  ],
  [
    'https://auth.example.test/authorize?nonce=random-nonce-value&response_type=code',
    ['random', 'value'],
  ],
  ['password=correct horse battery staple&safe=ok', ['correct', 'horse', 'battery', 'staple']],
  ['secret=correct horse battery staple&safe=ok', ['correct', 'horse', 'battery', 'staple']],
  [
    'client_secret=correct horse battery staple&grant_type=client_credentials',
    ['correct', 'horse', 'battery', 'staple'],
  ],
  ['https://alice:correct horse@localhost/callback?safe=ok', ['alice', 'correct', 'horse']],
  ['https://correct horse:battery staple@localhost/', ['correct', 'horse', 'battery', 'staple']],
  ['login failed password=correct horse battery staple', ['correct']],
  ['--password=correct horse battery staple', ['correct']],
  ['{"password": "correct horse battery staple"}', []],
  ['{"secret": "correct horse battery staple", "safe": "ok"}', []],
  ['Authorization: Basic correct horse battery staple', ['correct']],
  ['Authorization: Bearer correct horse battery staple', ['correct']],
  ['/callback?code=correct horse battery&state=ok', ['correct', 'horse', 'battery', 'ok']],
  ['request failed for /callback?code=correct horse battery', ['correct', 'horse', 'battery']],
  ['boom Bearer abcdefghijklmnop https://x.test/cb?code=SECRETCODE', ['SECRETCODE']],
  ['//alice:secret@h/a b?c=1', ['alice', 'secret', 'h']],
  ['http:alice:secret@h/a b?c=1', ['http', 'alice', 'secret', 'h']],
  ['//alice:pw@h/x, /y?token=z', ['alice', 'pw', 'h', 'z']],
  ['redirect to https://host:port/cb?code=SECRET', ['SECRET']],
  ['redirect to https://localhost:99999/cb?code=SECRET', ['SECRET']],
  ['upstream sent Bearer tok?en', ['tok', 'en']],
  ['boom ftp://u:ph@h/x Bearer T2', ['T2']],
  ['Bearer /cb?code=C2 retrying', ['C2', 'retrying']],
];

const HIDDEN_ON_MAIN_AT_CD8A4DE: readonly (readonly [string, readonly string[]])[] = [
  ['boom Bearer abc123 https://example.test/callback?code=secret-code', ['abc123', 'secret']],
  ['password=open sesame&hint=sesame', ['open']],
  ['password=hunter !!$$&safe=ok', ['hunter']],
  ['boom Bearer abc123 /callback?code=secret-code retrying', ['abc123', 'secret', 'retrying']],
  [
    'grant_type=authorization_code&code=secret-code&code_verifier=pkce-secret&client_id=oak-client&state=opaque-state&nonce=random-nonce&client_assertion=signed-client-jwt',
    ['secret', 'pkce', 'opaque', 'random', 'signed', 'jwt'],
  ],
  ['Authorization: Bearer CANARY-SECRET-TOKEN-99887766', ['CANARY', 'SECRET', 'TOKEN', '99887766']],
  [
    'Authorization: Bearer%20CANARY-SECRET-TOKEN-99887766',
    ['CANARY', 'SECRET', 'TOKEN', '99887766'],
  ],
  [
    'https://api.example.com/Bearer%20CANARY-SECRET-TOKEN-99887766',
    ['CANARY', 'SECRET', 'TOKEN', '99887766'],
  ],
  [
    'Bearer CANARY-SECRET-TOKEN-99887766 see https://example.test/docs',
    ['CANARY', 'SECRET', 'TOKEN', '99887766'],
  ],
  [
    'https://example.test/path?info=Bearer CANARY-SECRET-TOKEN-99887766',
    ['CANARY', 'SECRET', 'TOKEN', '99887766'],
  ],
  [
    'https://example.test/path#frag=Bearer CANARY-SECRET-TOKEN-99887766',
    ['CANARY', 'SECRET', 'TOKEN', '99887766'],
  ],
  [
    'log line: foo%20token=CANARY-SECRET-TOKEN-99887766 extra',
    ['CANARY', 'SECRET', 'TOKEN', '99887766'],
  ],
  ['boom Bearer tok123 /cb?code=correct horse', ['tok123', 'correct', 'horse']],
];

const SHOWN_ON_MAIN_AT_CD8A4DE: readonly (readonly [string, readonly string[]])[] = [
  ['password%3Dhunter2', ['hunter2']],
  ['secret%3Dhunter2', ['hunter2']],
  ['token%3Dhunter2', ['hunter2']],
  ['password%253Dhunter2', ['hunter2']],
  ['log line password%3Dhunter2 more', ['hunter2']],
  ['x%20password%3Dhunter2&y=1', ['hunter2']],
  ['Bearer%2520tok123', ['tok123']],
  ['Authorization: Bearer%2520tok123', ['tok123']],
  ['boom%2520Bearer%2520tok123', ['tok123']],
  ['Bearer abc%20SECRETTAIL', ['abc', 'SECRETTAIL']],
  ['login failed password=correct horse battery staple', ['correct', 'horse', 'battery', 'staple']],
  ['note: secret=alpha bravo charlie then more text', ['alpha', 'bravo', 'charlie']],
  ['boom%20Bearer%20tok123', ['tok123']],
  ['boom%20Bearer%20tok123 /cb?code=correct horse', ['tok123', 'correct', 'horse']],
  ['password=correct horse x=1', ['correct', 'horse']],
  ['password=correct horse\nnext line', ['correct', 'horse']],
];

const SHOWN_ON_MAIN_AT_4412760: readonly (readonly [string, readonly string[]])[] = [
  ['code=CANARYCODE&redirect_uri=https://client.example/callback?state=s1', ['CANARYCODE']],
  [
    'grant_type=authorization_code&code=CANARYCODE&redirect_uri=https://client.example/cb',
    ['CANARYCODE'],
  ],
  ['code=CANARYCODE&next=/cb?state=CANARYSTATE', ['CANARYCODE', 'CANARYSTATE']],
  ['state=CANARYSTATE&redirect_uri=https://client.example/cb?x=1', ['CANARYSTATE']],
  ['code=CANARYCODE&redirect_uri=https://client.example/cb?x=1\n', ['CANARYCODE']],
  ['code=CANARYCODE&redirect_uri=https://client.example/cb?x=1&note=a b', ['CANARYCODE']],
];

const HIDDEN_ON_MAIN_AT_4412760: readonly (readonly [string, readonly string[]])[] = [
  ['/callback/a=b?code=CANARYCODE', ['CANARYCODE']],
  ['./callback/a=b?code=CANARYCODE', ['CANARYCODE']],
  ['../callback/a=b?code=CANARYCODE', ['CANARYCODE']],
  ['callback/a=b?code=CANARYCODE', ['CANARYCODE']],
  ['x=1&next=/cb?code=CANARYCODE', ['CANARYCODE']],
  ['a=b?code=CANARYCODE&c=d', ['CANARYCODE']],
  ['https://client.example/cb?code=CANARYCODE&x=a=b', ['CANARYCODE']],
];

const COLON_SEPARATED_SHAPES: readonly ((key: string) => string)[] = [
  (key) => `${key}: alpha bravo charlie`,
  (key) => `${key} : alpha bravo charlie`,
  (key) => `${key} = alpha bravo charlie`,
  (key) => `{"${key}": "alpha bravo, charlie"}`,
  (key) => `{"${key}":"alpha bravo, charlie"}`,
  (key) => `{"user":"u1","${key}":"alpha bravo, charlie","n":1}`,
  (key) => `${key}%3Aalpha%20bravo%20charlie`,
  (key) => `log line ${key}%3A alpha bravo charlie`,
];

const SHOWN_ON_F4CB6E7: readonly (readonly [string, readonly string[]])[] = [
  ['password: correct horse battery staple', ['correct', 'horse', 'battery', 'staple']],
  ['{"token": "abc secret value, more"}', ['abc', 'secret', 'value', 'more']],
  ...['password', 'secret', 'token', 'api_key', 'api-key', 'apikey'].flatMap((key) =>
    COLON_SEPARATED_SHAPES.map((shape) => [shape(key), ['alpha', 'bravo', 'charlie']] as const),
  ),
];

function decodeFully(text: string): string {
  let previous: string;
  let decoded = text.replaceAll('+', ' ');
  do {
    previous = decoded;
    decoded = decoded.replaceAll(/(?:%[\da-f]{2})+/giu, (escapes) => {
      try {
        return decodeURIComponent(escapes);
      } catch {
        return escapes;
      }
    });
  } while (decoded !== previous);
  return decoded;
}

function visibleWords(text: string): ReadonlySet<string> {
  return new Set(decodeFully(text).split(/[^\p{L}\p{N}]+/u));
}

describe.each([
  ['main at 82f928b hid', HIDDEN_ON_MAIN_AT_82F928B],
  ['main at cd8a4de hid', HIDDEN_ON_MAIN_AT_CD8A4DE],
  ['main at cd8a4de showed', SHOWN_ON_MAIN_AT_CD8A4DE],
  ['f4cb6e7 showed', SHOWN_ON_F4CB6E7],
  ['main at 4412760 showed', SHOWN_ON_MAIN_AT_4412760],
  ['main at 4412760 hid', HIDDEN_ON_MAIN_AT_4412760],
])('redactTelemetryValue never shows a credential word that %s', (_, rows) => {
  it.each(rows)('%j', (input, hidden) => {
    const visible = visibleWords(redactTelemetryValue(input));
    expect(hidden.filter((word) => visible.has(word))).toStrictEqual([]);
  });
});

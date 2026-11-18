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

function visibleWords(text: string): ReadonlySet<string> {
  return new Set(decodeURIComponent(text.replaceAll('+', ' ')).split(/[^\p{L}\p{N}]+/u));
}

describe('redactTelemetryValue never shows a word that main at 82f928b hid', () => {
  it.each(HIDDEN_ON_MAIN_AT_82F928B)('%s', (input, hiddenOnMain) => {
    const visible = visibleWords(redactTelemetryValue(input));
    expect(hiddenOnMain.filter((word) => visible.has(word))).toStrictEqual([]);
  });
});

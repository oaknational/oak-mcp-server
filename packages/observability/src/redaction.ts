/**
 * Shared telemetry redaction helpers.
 *
 * The policy is recursive and value-oriented so it can be reused by logs,
 * spans, breadcrumbs, CLI metadata, and future Sentry hooks. It also covers
 * secret-bearing wire formats such as URL query strings and form-encoded
 * OAuth payloads, not just already-parsed objects.
 */

import { typeSafeEntries } from './type-safe.js';
import { redactFormEncodedString } from './redaction-form.js';
import { RELATIVE_URL_BASE, redactUrlString } from './redaction-url.js';
import type { JsonObject, JsonValue } from './types.js';

/**
 * Redaction placeholder used across all observability surfaces.
 */
export const REDACTED_VALUE = '[REDACTED]';

const FULLY_REDACTED_KEYS = new Set([
  'access_token',
  'api-key',
  'api_key',
  'apikey',
  'assertion',
  'authorization',
  'client_assertion',
  'client_secret',
  'code',
  'code_verifier',
  'cookie',
  'dsn',
  'id_token',
  'ip',
  'nonce',
  'passwd',
  'password',
  'proxy-authorization',
  'pwd',
  'refresh_token',
  'secret',
  'set-cookie',
  'state',
  'token',
  'x-api-key',
  'x-auth-token',
  'x-vercel-oidc-token',
  'x-vercel-proxy-signature',
]);

const PARTIALLY_REDACTED_HEADERS = new Set([
  'cf-connecting-ip',
  'x-forwarded-for',
  'x-real-ip',
  'x-vercel-forwarded-for',
  'x-vercel-proxied-for',
]);

const REDACTED_QUERY_KEYS = new Set([
  'access_token',
  'assertion',
  'api_key',
  'apikey',
  'client_assertion',
  'client_secret',
  'code',
  'code_verifier',
  'id_token',
  'nonce',
  'refresh_token',
  'state',
  'token',
]);

function isJsonObject(value: JsonValue): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normaliseKey(key: string): string {
  return key.toLowerCase();
}

function shouldFullyRedactKey(key: string): boolean {
  const normalisedKey = normaliseKey(key);
  return (
    FULLY_REDACTED_KEYS.has(normalisedKey) ||
    normalisedKey.includes('token') ||
    normalisedKey.includes('secret') ||
    normalisedKey.includes('password') ||
    normalisedKey.includes('email')
  );
}

function shouldPartiallyRedactHeader(key: string): boolean {
  return PARTIALLY_REDACTED_HEADERS.has(normaliseKey(key));
}

function partiallyRedactValue(value: string): string {
  if (value.length <= 8) {
    return REDACTED_VALUE;
  }

  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

/**
 * Credential separators ordinarily arrive as literal whitespace, but a
 * caller may have already percent-encoded the string (`%20`) before it
 * reaches this fallback matcher — `redactUrlString` and
 * `redactFormEncodedString` only decode separators inside the URL parts or
 * key=value shapes they each recognise, so `Bearer%20<token>` embedded in
 * plain text or in a URL path reaches here unchanged. Both regexes below
 * accept `%20` alongside `\s` so that case is still redacted.
 *
 * Deliberately narrow to `%20`: `+` only means "space" inside
 * `application/x-www-form-urlencoded` content, which `redactFormEncodedString`
 * already redacts upstream, and no real `Authorization` header uses a tab
 * separator (RFC 7235 requires `1*SP`).
 */
function redactEmbeddedCredentials(value: string): string {
  return value
    .replaceAll(/\b(Bearer|Basic)(?:\s|%20)+(?:(?!%20)[^\s,])+/giu, '$1 [REDACTED]')
    .replaceAll(
      /(^|\s|%20)(--?(?:access-token|api-key|api_key|client-secret|client_secret|password|token)|(?:access_token|api_key|client_secret|password|token))=([^\s&]+)/giu,
      '$1$2=[REDACTED]',
    );
}

const ENCODED_SPACE = String.raw`%(?:25)*20`;
const ENCODED_EQUALS = String.raw`%(?:25)*3D`;
const ENCODED_REDACTED_VALUE = encodeURIComponent(REDACTED_VALUE);

const AFTER_PERCENT_ESCAPE = String.raw`(?<=%(?:25){0,8}[\dA-F]{2})`;
const WORD_START = String.raw`(?:\b|${AFTER_PERCENT_ESCAPE})`;
const TOKEN_START = String.raw`(?:(?<![\w-])|${AFTER_PERCENT_ESCAPE})`;
const SCHEME_SEPARATOR = String.raw`(?:\+|${ENCODED_SPACE})`;

const RESIDUAL_AUTH_SCHEME = new RegExp(
  String.raw`${WORD_START}(Bearer|Basic)(?:\s|${SCHEME_SEPARATOR})+[^\s,]+`,
  'giu',
);

const AUTHORIZATION_HEADER_CREDENTIAL = new RegExp(
  String.raw`${WORD_START}((?:proxy-)?authorization[ \t]*:[ \t]*[a-z][\w-]*)(?:[ \t]|${SCHEME_SEPARATOR})+(?![=:])[^\s,]+`,
  'giu',
);
const COOKIE_HEADER_VALUE = new RegExp(
  String.raw`${WORD_START}((?:set-)?cookie[ \t]*:[ \t]*)\S[^\r\n]*`,
  'giu',
);
const API_KEY_SK = new RegExp(String.raw`${TOKEN_START}sk-[\w-]{20,}`, 'gu');
const JWT = new RegExp(String.raw`${TOKEN_START}eyJ[\w-]+\.[\w-]+\.[\w-]+`, 'gu');

const CREDENTIAL_SEPARATOR = String.raw`(?:[=:]|%(?:25)*3[AD])`;
const CREDENTIAL_KEY = String.raw`(?:password|passwd|pwd|secret|token|api[_-]?key)[\w.-]{0,64}\\?["']?[ \t]*${CREDENTIAL_SEPARATOR}[ \t]*`;
const QUOTED_VALUE = String.raw`"((?:[^"\\\r\n]|\\.)*)"`;
const VALUE_ENDS_AT_NEXT_KEY_OR_LINE_END = String.raw`(?=\s[^\s=&]+(?:=|${ENCODED_EQUALS})|[\r\n&]|$)`;

const RESIDUAL_KEY_VALUE = new RegExp(
  String.raw`(${CREDENTIAL_KEY})(?:${QUOTED_VALUE}|([^\r\n&]*?)${VALUE_ENDS_AT_NEXT_KEY_OR_LINE_END})`,
  'giu',
);

function redactResidualCredentials(value: string): string {
  return value
    .replaceAll(RESIDUAL_AUTH_SCHEME, `$1 ${REDACTED_VALUE}`)
    .replaceAll(AUTHORIZATION_HEADER_CREDENTIAL, `$1 ${REDACTED_VALUE}`)
    .replaceAll(COOKIE_HEADER_VALUE, `$1${REDACTED_VALUE}`)
    .replaceAll(API_KEY_SK, REDACTED_VALUE)
    .replaceAll(JWT, REDACTED_VALUE)
    .replaceAll(
      RESIDUAL_KEY_VALUE,
      (match, key: string, quoted: string | undefined, unquoted: string | undefined) => {
        const secret = quoted ?? unquoted;
        if (secret === '' || secret === REDACTED_VALUE || secret === ENCODED_REDACTED_VALUE) {
          return match;
        }
        return quoted === undefined ? `${key}${REDACTED_VALUE}` : `${key}"${REDACTED_VALUE}"`;
      },
    );
}

const FIRST_URL_WORD = /(?<=^|\s)\S*(?:\?|:\/\/)/u;

/**
 * Redacting a log message as one relative URL percent-encodes the prose before
 * its first URL word, which hides a Bearer token from the credential patterns.
 * Running those patterns on the whole message first doesn't fix that: a token
 * match can swallow a URL's `?` and change what the URL parse redacts.
 */
function redactString(value: string): string {
  const urlStart = value.search(FIRST_URL_WORD);
  const prefix = value.slice(0, urlStart);
  const rest = redactEmbeddedCredentials(value.slice(urlStart));
  if (urlStart <= 0 || !isPlainTextBeforeUrl(value, prefix, rest)) {
    return redactSingleValue(value);
  }

  return redactEmbeddedCredentials(prefix) + redactSingleValue(rest);
}

function isPlainTextBeforeUrl(value: string, prefix: string, rest: string): boolean {
  const whole = URL.parse(value, RELATIVE_URL_BASE);
  return (
    whole?.origin === RELATIVE_URL_BASE &&
    whole.username === '' &&
    whole.password === '' &&
    URL.canParse(rest, RELATIVE_URL_BASE) &&
    !/\b(?:Bearer|Basic)\s+$/iu.test(prefix)
  );
}

function redactSingleValue(value: string): string {
  const redactedFormPayload = redactFormEncodedString(value, {
    normaliseKey,
    redactedQueryKeys: REDACTED_QUERY_KEYS,
    redactedValue: REDACTED_VALUE,
    shouldFullyRedactKey,
  });
  const redactedUrl = redactUrlString(redactedFormPayload, {
    normaliseKey,
    redactedQueryKeys: REDACTED_QUERY_KEYS,
    redactedValue: REDACTED_VALUE,
  });

  if (redactedFormPayload !== value) {
    return redactedUrl;
  }

  return redactEmbeddedCredentials(redactedUrl);
}

function redactScalarForKey(key: string | undefined, value: string): string {
  if (key !== undefined) {
    if (shouldFullyRedactKey(key)) {
      return REDACTED_VALUE;
    }

    if (shouldPartiallyRedactHeader(key)) {
      return partiallyRedactValue(value);
    }
  }

  return redactResidualCredentials(redactString(value));
}

function redactArray(values: readonly JsonValue[], key: string | undefined): readonly JsonValue[] {
  return values.map((entry) => redactTelemetryValue(entry, key));
}

function redactObject(value: JsonObject): JsonObject {
  const redacted: Record<string, JsonValue> = {};

  for (const [key, entry] of typeSafeEntries(value)) {
    redacted[key] = redactTelemetryValue(entry, key);
  }

  return redacted;
}

/**
 * Recursively redacts a JSON-safe telemetry value.
 *
 * @param value - JSON-safe telemetry input
 * @param key - Optional parent key used for key-specific redaction rules
 * @returns Redacted JSON-safe telemetry value. A `string` input always
 * yields a `string` (scalar redaction preserves the type), so the `string`
 * overload lets string-only callers consume the result without a narrowing
 * guard.
 */
export function redactTelemetryValue(value: string, key?: string): string;
export function redactTelemetryValue(value: JsonValue, key?: string): JsonValue;
export function redactTelemetryValue(value: JsonValue, key?: string): JsonValue {
  if (typeof value === 'string') {
    return redactScalarForKey(key, value);
  }

  if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
    return value;
  }

  if (Array.isArray(value)) {
    return redactArray(value, key);
  }

  if (isJsonObject(value)) {
    return redactObject(value);
  }

  return value;
}

/**
 * Recursively redacts a JSON-safe telemetry object.
 *
 * @param value - JSON-safe telemetry object
 * @returns Redacted object
 */
export function redactTelemetryObject(value: JsonObject): JsonObject {
  return redactObject(value);
}

/**
 * Redacts a single header value using the shared telemetry policy.
 *
 * @param name - Header name
 * @param value - Header value
 * @returns Redacted string safe for logs and telemetry
 */
export function redactHeaderValue(
  name: string,
  value: string | string[] | number | undefined,
): string {
  if (value === undefined) {
    return '[undefined]';
  }

  const stringValue = Array.isArray(value) ? value.join(', ') : String(value);
  return redactScalarForKey(name, stringValue);
}

/**
 * Applies header redaction to a full header record.
 *
 * @param headers - Header record to redact
 * @returns Redacted header record
 */
export function redactHeaderRecord(
  headers: Readonly<Record<string, string | string[] | number | undefined>>,
): Record<string, string> {
  const redactedHeaders: Record<string, string> = {};

  for (const [key, value] of typeSafeEntries(headers)) {
    redactedHeaders[key] = redactHeaderValue(key, value);
  }

  return redactedHeaders;
}

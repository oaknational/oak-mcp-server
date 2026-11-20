/**
 * Header redaction utility for secure logging
 *
 * Redacts sensitive information from HTTP headers before logging.
 * Preserves header structure while masking actual values.
 */

import type { IncomingHttpHeaders, OutgoingHttpHeaders } from 'node:http';

import { redactHeaderValue } from '@oaknational/observability';

/**
 * Redacts sensitive information from request or response headers.
 *
 * @param headers - Headers object (from req.headers or res.getHeaders())
 * @returns Redacted headers object safe for logging
 *
 * @example
 * ```typescript
 * const safeHeaders = redactHeaders(req.headers);
 * logger.debug('Request received', { headers: safeHeaders });
 * ```
 */
export function redactHeaders(
  headers:
    | IncomingHttpHeaders
    | OutgoingHttpHeaders
    | Record<string, string | string[] | number | undefined>,
): Record<string, string> {
  const redacted: Record<string, string> = {};

  for (const name in headers) {
    redacted[name] = redactHeaderValue(name, headers[name]);
  }

  return redacted;
}

/**
 * Creates a summary of headers with sensitive information redacted.
 * Only includes headers that are commonly useful for debugging.
 *
 * @param headers - Headers object
 * @returns Compact redacted headers object for logging
 */
export function redactHeadersSummary(
  headers:
    | IncomingHttpHeaders
    | OutgoingHttpHeaders
    | Record<string, string | string[] | number | undefined>,
): Record<string, string> {
  const interestingHeaders = [
    'accept',
    'authorization',
    'content-type',
    'cookie',
    'host',
    'origin',
    'referer',
    'user-agent',
    'www-authenticate',
    'x-clerk-auth-reason',
    'x-clerk-auth-status',
    'x-correlation-id',
    'x-forwarded-for',
    'x-real-ip',
    // Vercel caching and infrastructure headers
    'x-vercel-cache',
    'x-vercel-id',
    'x-vercel-ip-country',
    // Cloudflare caching and security headers
    'cf-cache-status',
    'cf-ray',
    'cf-ipcountry',
    'cf-connecting-ip',
  ];

  // Conditionally add body if the content-type is application/json or text/plain or text/html
  const contentType = headers['content-type'];
  const shouldAddBody =
    contentType &&
    typeof contentType === 'string' &&
    (contentType.startsWith('application/json') ||
      contentType.startsWith('text/plain') ||
      contentType.startsWith('text/html'));

  if (shouldAddBody) {
    interestingHeaders.push('body');
  }

  const redacted: Record<string, string> = {};

  for (const name of interestingHeaders) {
    const value = headers[name];
    if (value !== undefined) {
      redacted[name] = redactHeaderValue(name, value);
    }
  }

  return redacted;
}

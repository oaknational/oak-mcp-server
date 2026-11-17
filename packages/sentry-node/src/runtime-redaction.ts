import type { Breadcrumb, Exception, NodeOptions, RequestEventData } from '@sentry/node';
import {
  redactJsonObject,
  redactStringRecord,
  redactText,
  redactUnknownValue,
} from '@oaknational/observability';
import { typeSafeEntries } from './type-safe.js';

type SentryErrorEvent = Parameters<NonNullable<NodeOptions['beforeSend']>>[0];
type SentryLogPayload = Parameters<NonNullable<NodeOptions['beforeSendLog']>>[0];
type SentrySpanPayload = Parameters<NonNullable<NodeOptions['beforeSendSpan']>>[0];
type SentryTransactionEvent = Parameters<NonNullable<NodeOptions['beforeSendTransaction']>>[0];
/**
 * The static `SpanJSON` shape (`data`/`description`) that `@sentry/core`'s
 * `processBeforeSend` hands to a `beforeSendSpan` callback wrapped with
 * `Sentry.withStaticSpan()`, for both a transaction's root span and every
 * entry of `TransactionEvent.spans[]`. Derived structurally from
 * `SentryTransactionEvent['spans']` rather than imported from `@sentry/core`
 * directly, since `@sentry/node` doesn't re-export `SpanJSON` by name and
 * this repo depends only on `@sentry/node`.
 */
type SentryStaticSpanPayload = NonNullable<SentryTransactionEvent['spans']>[number];

function redactQueryString(
  queryString: RequestEventData['query_string'] | undefined,
): RequestEventData['query_string'] | undefined {
  if (queryString === undefined) {
    return undefined;
  }

  if (typeof queryString === 'string') {
    return redactText(queryString);
  }

  return redactText(new URLSearchParams(queryString).toString());
}

function redactRequestEventData(
  request: RequestEventData | undefined,
): RequestEventData | undefined {
  if (!request) {
    return undefined;
  }

  const queryString = redactQueryString(request.query_string);
  const cookies = redactStringRecord(request.cookies);
  const env = redactStringRecord(request.env);
  const headers = redactStringRecord(request.headers);

  return {
    ...request,
    ...(request.url ? { url: redactText(request.url) } : {}),
    ...(request.data !== undefined ? { data: redactUnknownValue(request.data, 'data') } : {}),
    ...(queryString !== undefined ? { query_string: queryString } : {}),
    ...(cookies ? { cookies } : {}),
    ...(env ? { env } : {}),
    ...(headers ? { headers } : {}),
  };
}

function redactBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  const data = redactJsonObject(breadcrumb.data);

  return {
    ...breadcrumb,
    ...(breadcrumb.message ? { message: redactText(breadcrumb.message) } : {}),
    ...(data ? { data } : {}),
  };
}

function redactBreadcrumbs(
  breadcrumbs: readonly Breadcrumb[] | undefined,
): Breadcrumb[] | undefined {
  return breadcrumbs?.map((breadcrumb) => redactBreadcrumb(breadcrumb));
}

function redactException(exception: Exception): Exception {
  return {
    ...exception,
    ...(exception.type ? { type: redactText(exception.type) } : {}),
    ...(exception.value ? { value: redactText(exception.value) } : {}),
    ...(exception.module ? { module: redactText(exception.module) } : {}),
  };
}

function redactLogEntry(
  logEntry: SentryErrorEvent['logentry'],
): SentryErrorEvent['logentry'] | undefined {
  if (!logEntry) {
    return undefined;
  }

  return {
    ...logEntry,
    ...(logEntry.message ? { message: redactText(logEntry.message) } : {}),
    ...(logEntry.params
      ? {
          params: logEntry.params.map((parameter) => redactUnknownValue(parameter)),
        }
      : {}),
  };
}

function redactCommonEventFields(event: {
  readonly breadcrumbs?: readonly Breadcrumb[];
  readonly contexts?: SentryErrorEvent['contexts'];
  readonly exception?: SentryErrorEvent['exception'];
  readonly extra?: SentryErrorEvent['extra'];
  readonly logentry?: SentryErrorEvent['logentry'];
  readonly message?: string;
  readonly request?: RequestEventData;
  readonly transaction?: string;
}): {
  readonly breadcrumbs?: Breadcrumb[];
  readonly contexts?: SentryErrorEvent['contexts'];
  readonly exception?: SentryErrorEvent['exception'];
  readonly extra?: SentryErrorEvent['extra'];
  readonly logentry?: SentryErrorEvent['logentry'];
  readonly message?: string;
  readonly request?: RequestEventData;
  readonly transaction?: string;
} {
  const contexts = redactContexts(event.contexts);
  const breadcrumbs = redactBreadcrumbs(event.breadcrumbs);
  const extra = redactJsonObject(event.extra);
  const exceptionValues = event.exception?.values?.map((value) => redactException(value));
  const logentry = redactLogEntry(event.logentry);
  const request = redactRequestEventData(event.request);
  const exception = event.exception
    ? {
        ...event.exception,
        ...(exceptionValues ? { values: exceptionValues } : {}),
      }
    : undefined;

  return {
    breadcrumbs,
    contexts,
    exception,
    extra,
    logentry,
    message: event.message ? redactText(event.message) : undefined,
    request,
    transaction: event.transaction ? redactText(event.transaction) : undefined,
  };
}

function redactContexts(
  contexts: SentryErrorEvent['contexts'],
): SentryErrorEvent['contexts'] | undefined {
  if (!contexts) {
    return undefined;
  }

  const redacted: NonNullable<SentryErrorEvent['contexts']> = {};

  for (const [key, context] of typeSafeEntries(contexts)) {
    const redactedContext = redactJsonObject(context);

    if (redactedContext) {
      redacted[key] = redactedContext;
    }
  }

  return redacted;
}

function isStringSpanArray(
  value: SentrySpanPayload['attributes'][string],
): value is (string | null | undefined)[] {
  return (
    Array.isArray(value) &&
    value.every((entry) => entry === null || entry === undefined || typeof entry === 'string')
  );
}

function redactSpanAttributeValue(
  key: string,
  value: SentrySpanPayload['attributes'][string],
): SentrySpanPayload['attributes'][string] {
  if (value === undefined || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    return redactText(value, key);
  }

  if (isStringSpanArray(value)) {
    return value.map((entry) => (typeof entry === 'string' ? redactText(entry, key) : entry));
  }

  return value;
}

function redactSpanData(
  attributes: SentrySpanPayload['attributes'],
): SentrySpanPayload['attributes'] {
  const redacted: SentrySpanPayload['attributes'] = {};

  for (const [key, value] of typeSafeEntries(attributes)) {
    redacted[key] = redactSpanAttributeValue(key, value);
  }

  return redacted;
}

function isStaticSpanAttributeStringArray(
  value: SentryStaticSpanPayload['data'][string],
): value is (string | null | undefined)[] {
  return (
    Array.isArray(value) &&
    value.every((entry) => entry === null || entry === undefined || typeof entry === 'string')
  );
}

function redactStaticSpanAttributeValue(
  key: string,
  value: SentryStaticSpanPayload['data'][string],
): SentryStaticSpanPayload['data'][string] {
  if (value === undefined || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    return redactText(value, key);
  }

  if (isStaticSpanAttributeStringArray(value)) {
    return value.map((entry) => (typeof entry === 'string' ? redactText(entry, key) : entry));
  }

  if (isStaticSpanAttributeNumberOrBooleanArray(value)) {
    return value;
  }

  // The attribute type allows only scalars and scalar arrays, but the SDK
  // sends whatever a caller sets. Redact anything else recursively and send
  // it as JSON text, which the attribute type does allow.
  return JSON.stringify(redactUnknownValue(value, key));
}

function isStaticSpanAttributeNumberOrBooleanArray(
  value: SentryStaticSpanPayload['data'][string],
): boolean {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        entry === null ||
        entry === undefined ||
        typeof entry === 'number' ||
        typeof entry === 'boolean',
    )
  );
}

function redactStaticSpanData(
  data: SentryStaticSpanPayload['data'],
): SentryStaticSpanPayload['data'] {
  const redacted: SentryStaticSpanPayload['data'] = {};

  for (const [key, value] of typeSafeEntries(data)) {
    redacted[key] = redactStaticSpanAttributeValue(key, value);
  }

  return redacted;
}

export function redactSentryEvent(event: SentryErrorEvent): SentryErrorEvent {
  return {
    ...event,
    ...redactCommonEventFields(event),
  };
}

export function redactSentryBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  return redactBreadcrumb(breadcrumb);
}

export function redactSentryTransaction(event: SentryTransactionEvent): SentryTransactionEvent {
  return {
    ...event,
    ...redactCommonEventFields(event),
  };
}

/**
 * Redacts a span in the STREAMED `StreamedSpanJSON` shape (`attributes`/`name`)
 * — what `beforeSendSpan` receives by default under `traceLifecycle: 'stream'`.
 *
 * Not currently wired: this adapter stays on `traceLifecycle: 'static'` (see
 * `runtime-sdk.ts`), under which `beforeSendSpan` only ever receives
 * `StreamedSpanJSON` for a genuine standalone span (`isStandalone: true`) —
 * something nothing in this codebase creates today. Kept, and exercised
 * directly by `runtime-redaction-barrier.unit.test.ts`, as the
 * implementation to swap back in — unwrapped, replacing
 * `withStaticSpan(redactSentryStaticSpan)` — when the `traceLifecycle:
 * 'stream'` migration flagged in `runtime-sdk.ts` lands. Delete
 * `redactSentryStaticSpan` at that point.
 */
export function redactSentrySpan(span: SentrySpanPayload): SentrySpanPayload {
  return {
    ...span,
    attributes: redactSpanData(span.attributes),
    name: redactText(span.name),
  };
}

/**
 * Redacts a span in the STATIC `SpanJSON` shape (`data`/`description`) —
 * what `@sentry/core` hands to a `beforeSendSpan` callback wrapped with
 * `Sentry.withStaticSpan()` under `traceLifecycle: 'static'`.
 *
 * `processBeforeSend` (`@sentry/core`'s client) applies this callback to
 * BOTH the transaction's own root span and to every entry of
 * `TransactionEvent.spans[]` — this is what actually closes the redaction
 * gap for embedded child spans. An *unwrapped* `beforeSendSpan` is silently
 * never invoked in static mode for either path (confirmed against
 * @sentry/core@11.11.0's client.js). See `runtime-sdk.ts` for the
 * `withStaticSpan` wiring this function is used by.
 */
export function redactSentryStaticSpan(span: SentryStaticSpanPayload): SentryStaticSpanPayload {
  return {
    ...span,
    data: redactStaticSpanData(span.data),
    ...(span.description ? { description: redactText(span.description) } : {}),
  };
}

export function redactSentryLog(log: SentryLogPayload): SentryLogPayload {
  const attributes = redactJsonObject(log.attributes);

  return {
    ...log,
    message: redactText(log.message),
    ...(attributes ? { attributes } : {}),
  };
}

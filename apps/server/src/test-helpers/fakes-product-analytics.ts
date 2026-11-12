/**
 * Product-analytics test fakes for resource-read observation tests (MCP-242).
 *
 * `createFake*` naming per the shared convention in `fakes.ts`: plain objects
 * satisfying narrow interfaces structurally (ADR-078), no library dependency.
 */

import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type { ServerNotification, ServerRequest } from '@modelcontextprotocol/sdk/types.js';
import type {
  ProductAnalyticsCaptureContext,
  ProductAnalyticsEvent,
  ProductAnalyticsSink,
} from '@oaknational/observability';

/** One recorded product-analytics capture: the fact and its identity context. */
export interface RecordedAnalyticsCapture {
  readonly event: ProductAnalyticsEvent;
  readonly context: ProductAnalyticsCaptureContext;
}

/**
 * Creates a recording `ProductAnalyticsSink` for resource-read observation
 * tests. Plain object — satisfies the interface structurally.
 */
export function createRecordingProductAnalyticsSink(): {
  sink: ProductAnalyticsSink;
  captures: RecordedAnalyticsCapture[];
} {
  const captures: RecordedAnalyticsCapture[] = [];
  return {
    sink: {
      capture: (event, context) => {
        captures.push({ event, context });
      },
    },
    captures,
  };
}

/**
 * Creates a minimal `RequestHandlerExtra` for invoking resource read
 * callbacks directly, mirroring the runtime `resources/read` lifecycle.
 * Auth context is attached only when supplied — its absence models the
 * public path, where auth middleware never runs.
 */
export function createFakeReadResourceExtra(
  authInfo?: AuthInfo,
): RequestHandlerExtra<ServerRequest, ServerNotification> {
  return {
    signal: new AbortController().signal,
    requestId: 'test-request',
    sendNotification: () => Promise.resolve(),
    sendRequest: () => Promise.reject(new Error('sendRequest is not supported in this fake')),
    ...(authInfo === undefined ? {} : { authInfo }),
  };
}

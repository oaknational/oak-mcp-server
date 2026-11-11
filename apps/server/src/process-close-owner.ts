/**
 * The process-level close owner (MCP-243).
 *
 * Every exit path funnels here, and one shared close-pair promise makes the
 * pair exactly-once across RACED exit paths (a listen error and a signal can
 * both fire; `observability.close()` is not idempotent in live Sentry mode).
 * The first exit reason wins the log attribution.
 *
 * Close order is deliberate: product analytics FIRST, observability LAST —
 * the analytics operational reporter logs through a Sentry-backed sink, so
 * closing Sentry first would drop a PostHog close failure's signal. Each
 * attempt is independently guarded: a failure or rejection of one never
 * suppresses the other, failures log their fixed content-free Result kind,
 * and rejections log a fixed literal with no reason payload (a rejection
 * carries no closed kind and may carry vendor detail).
 *
 * @packageDocumentation
 */

import type { Logger } from '@oaknational/logger';
import type { ProductAnalyticsCloseError } from '@oaknational/observability';
import type { Result } from '@oaknational/result';
import type { HttpObservability } from './observability/http-observability.js';

/** Closes the product-analytics runtime; supplied as `() => analytics.close()`. */
export type CloseProductAnalytics = () => Promise<Result<void, ProductAnalyticsCloseError>>;

/**
 * Builds the shared close funnel used by every process exit path.
 *
 * @param observability - The Sentry-backed observability runtime to close last.
 * @param closeProductAnalytics - The product-analytics close, attempted first.
 * @param log - Bootstrap logger for the fixed content-free failure lines.
 * @returns An exactly-once close-pair function keyed on the first exit reason.
 */
export function createProcessCloseOwner(
  observability: HttpObservability,
  closeProductAnalytics: CloseProductAnalytics,
  log: Logger,
): (exitReason: string) => Promise<void> {
  let closePair: Promise<void> | undefined;

  return (exitReason: string): Promise<void> => {
    closePair ??= (async (): Promise<void> => {
      try {
        const analyticsResult = await closeProductAnalytics();
        if (!analyticsResult.ok) {
          log.warn('product-analytics.close.failed', {
            exitReason,
            error: analyticsResult.error.kind,
          });
        }
      } catch {
        log.warn('product-analytics.close.rejected', { exitReason });
      }

      try {
        const closeResult = await observability.close();
        if (!closeResult.ok) {
          log.warn('observability.close.failed', {
            exitReason,
            error: closeResult.error.kind,
          });
        }
      } catch {
        log.warn('observability.close.rejected', { exitReason });
      }
    })();

    return closePair;
  };
}

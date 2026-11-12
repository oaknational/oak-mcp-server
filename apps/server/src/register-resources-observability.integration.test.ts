/**
 * Characterisation Test: Resource and prompt registration completeness
 *
 * Verifies that `registerAllResources` registers
 * the expected number of handlers with the server.
 *
 * Native Sentry (`wrapMcpServerWithSentry`) handles handler error capture
 * and transport tracing — individual handler wrapping is no longer needed.
 *
 * Uses DI and simple fakes — no `vi.mock`, no global state.
 */

import { describe, it, expect, vi } from 'vitest';
import { registerAllResources } from './register-resources.js';
import { SERVED_SURFACE } from './served-surface/served-surface.js';

const TEST_WIDGET_HTML = '<!doctype html><html><body>Oak Curriculum App</body></html>';

/**
 * Total resource count recomputed from the served-surface definition: the
 * registered set is exactly the definition's live resource rows (the graph
 * corpora have no resource form — they are served by their anchored tools).
 */
const EXPECTED_RESOURCE_COUNT = Object.values(SERVED_SURFACE.resources).filter(
  (state) => state === 'live',
).length;

/**
 * Creates a minimal recording server using bare `vi.fn()` spies.
 *
 * Each spy satisfies the structural interface expected by `registerAllResources`
 * (`ResourceRegistrar`) without
 * requiring the full `McpServer` type or type assertions.
 */
function createRecordingServer() {
  return {
    registerResource: vi.fn(),
  };
}

describe('registerAllResources — registration completeness', () => {
  it('registers the expected number of resources', () => {
    const server = createRecordingServer();

    registerAllResources(server, {
      getWidgetHtml: () => TEST_WIDGET_HTML,
      servedSurface: SERVED_SURFACE,
    });

    expect(server.registerResource).toHaveBeenCalledTimes(EXPECTED_RESOURCE_COUNT);
  });
});

/**
 * Resource-read observation at the registration boundary (MCP-242).
 *
 * Wraps the application-owned `ResourceRegistrar` so authenticated resource
 * reads emit one closed `mcp_resource_read` fact through the product-analytics
 * sink, while public, unknown, and failed-registration paths remain
 * protocol-transparent: the wrapper never reads a resource result, forwards
 * the same arguments and return/error identity, records only the canonical
 * registration name, and derives identity only from the validated auth
 * context — `authInfo.extra.userId`, the same auth FIELD the transport
 * observer's tool events read, though the mechanisms differ (the tool path
 * probes structurally inside posthog-node; this path uses the app's
 * canonical `verifiedUserIdFrom`).
 *
 * @remarks
 * Public resources are excluded STRUCTURALLY, at registration time: a
 * fixed-URI registration on the public allowlist (`isPublicResourceUri` —
 * the same set the auth-skip decision uses) registers its callback
 * unwrapped, so no request-shape variation (URI normalisation differences,
 * JSON-RPC batches) can ever produce an event for a public resource. The
 * guarantee is FIXED-URI-ONLY by construction: the template branch observes
 * unconditionally (a template has no registration-time URI to classify),
 * which is sound because every production registration is fixed-URI — the
 * fact pinned by the every-registration-is-fixed tripwire in this module's
 * integration test; a template registration landing makes that test the
 * prompt to give the template branch its own public treatment.
 *
 * Deliberate silences, so the next reader knows they are considered rather
 * than unhandled:
 *
 * - An authenticated read without a `userId`, and identity drift that stops
 *   populating `userId`, produce the same zero-emission as an
 *   unauthenticated read. The wrapper has no operational-error channel by
 *   design (the sink's is internal to the PostHog adapter); public reads
 *   dominate traffic, so a per-miss signal would be noise.
 * - The registration handle returned to callers carries the WRAPPED read
 *   callback. `RegisteredResource.update({ callback })` would replace it and
 *   silently remove observation — nothing calls `update` today; a feature
 *   that does must re-wrap.
 *
 * @packageDocumentation
 */

import { performance } from 'node:perf_hooks';

import type {
  ReadResourceCallback,
  ReadResourceTemplateCallback,
  RegisteredResource,
  RegisteredResourceTemplate,
  ResourceMetadata,
  ResourceTemplate,
} from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type {
  ReadResourceResult,
  ServerNotification,
  ServerRequest,
} from '@modelcontextprotocol/sdk/types.js';
import type { ProductAnalyticsSink } from '@oaknational/observability';

import { verifiedUserIdFrom } from './auth/mcp-auth/verified-user-id.js';
import { isPublicResourceUri } from './auth/public-resources.js';
import type { ResourceRegistrar } from './register-resource-helpers.js';

type ReadExtra = RequestHandlerExtra<ServerRequest, ServerNotification>;

type FixedArgs = [
  name: string,
  uri: string,
  config: ResourceMetadata,
  readCallback: ReadResourceCallback,
];
type TemplateArgs = [
  name: string,
  template: ResourceTemplate,
  config: ResourceMetadata,
  readCallback: ReadResourceTemplateCallback,
];

function isFixedArgs(args: FixedArgs | TemplateArgs): args is FixedArgs {
  return typeof args[1] === 'string';
}

/**
 * Emits one closed resource-read fact when a verified actor exists. TOTAL by
 * construction — the guard encloses the whole body, identity derivation
 * included, so no capture-path failure can ever alter read behaviour. The
 * duration is rounded because the sink's validity gate accepts safe integers
 * only — a fractional monotonic delta would be dropped silently.
 */
function captureSafely(
  sink: ProductAnalyticsSink,
  name: string,
  startedAt: Date,
  durationMs: number,
  isError: boolean,
  extra: ReadExtra,
): void {
  try {
    const verifiedActorId = verifiedUserIdFrom(extra.authInfo);
    if (verifiedActorId === undefined) {
      return;
    }
    sink.capture(
      {
        kind: 'mcp_resource_read',
        resourceName: name,
        startedAt,
        durationMs: Math.round(durationMs),
        isError,
      },
      { verifiedActorId },
    );
  } catch {
    // Deliberate swallow: analytics must never alter a read (protocol transparency).
  }
}

/**
 * Wraps one read callback with observation, preserving the callback's
 * parameter tuple so the wrapped function stays assignable to the exact
 * overload it came from. The result value is never inspected; success and
 * failure re-surface with identity preserved. The success capture sits
 * OUTSIDE the read's try so a capture-path failure can never re-enter the
 * error path and masquerade as a read failure (captureSafely is total, so
 * this is belt-and-braces structure, not the load-bearing guard).
 */
function observeRead<TArgs extends readonly unknown[]>(
  name: string,
  sink: ProductAnalyticsSink,
  readExtra: (args: TArgs) => ReadExtra,
  readCallback: (...args: TArgs) => ReadResourceResult | Promise<ReadResourceResult>,
): (...args: TArgs) => Promise<ReadResourceResult> {
  return async (...args) => {
    const startedAt = new Date();
    const startedMs = performance.now();
    let result: ReadResourceResult;
    try {
      result = await readCallback(...args);
    } catch (error) {
      captureSafely(sink, name, startedAt, performance.now() - startedMs, true, readExtra(args));
      throw error;
    }
    captureSafely(sink, name, startedAt, performance.now() - startedMs, false, readExtra(args));
    return result;
  };
}

/**
 * Decorates a `ResourceRegistrar` so every registered read callback is
 * observed. Registration itself is deliberately NOT guarded: a failed
 * registration propagates untouched. The SDK registration handle is
 * forwarded by reference (`registerAppResource` composes on it).
 *
 * @param server - The registrar to delegate to (typically the per-request
 * `McpServer`, already Sentry-wrapped by the factory). Sentry patched
 * `registerResource` BEFORE this decorator, so it wraps the observed
 * callback we hand it: at read time Sentry is OUTERMOST and this wrapper
 * sits between Sentry and the callback. Consequences: measured durations
 * exclude Sentry's overhead, and the identity rethrow below is what
 * Sentry's `resource_execution` capture receives — softening it to a
 * Result would silently break that capture.
 * @param sink - The closed product-analytics capture capability (MCP-241).
 * @returns A registrar whose registrations observe authenticated reads.
 */
export function createObservedResourceRegistrar(
  server: ResourceRegistrar,
  sink: ProductAnalyticsSink,
): ResourceRegistrar {
  function registerResource(...args: FixedArgs): RegisteredResource;
  function registerResource(...args: TemplateArgs): RegisteredResourceTemplate;
  function registerResource(
    ...args: FixedArgs | TemplateArgs
  ): RegisteredResource | RegisteredResourceTemplate {
    if (isFixedArgs(args)) {
      const [name, uri, config, readCallback] = args;
      // Public resources register UNWRAPPED: emission for them is
      // structurally impossible, not merely conditioned on the auth-skip.
      if (isPublicResourceUri(uri)) {
        return server.registerResource(name, uri, config, readCallback);
      }
      return server.registerResource(
        name,
        uri,
        config,
        observeRead(name, sink, (readArgs) => readArgs[1], readCallback),
      );
    }
    const [name, template, config, readCallback] = args;
    return server.registerResource(
      name,
      template,
      config,
      observeRead(name, sink, (readArgs) => readArgs[2], readCallback),
    );
  }

  return { registerResource };
}

/**
 * The registrar the resource registration walk should use: the observed
 * decorator when a sink is supplied, otherwise the exact server reference —
 * the structural pin for "no registration layer when no sink is supplied".
 *
 * @remarks
 * Production always supplies a sink: off mode composes an INERT sink and
 * still takes the observed branch (wrapping is then a no-op at capture).
 * The bare-server branch serves callers that omit the option — tests and
 * any composition without analytics. Collapsing the two representations
 * (making the sink required) belongs to the MCP-243 seam work, not here.
 *
 * @param server - The registrar the registration walk would use unobserved.
 * @param sink - The optional product-analytics capture capability.
 * @returns The registrar to pass to `registerAllResources`.
 */
export function resourceRegistrarFor(
  server: ResourceRegistrar,
  sink: ProductAnalyticsSink | undefined,
): ResourceRegistrar {
  return sink === undefined ? server : createObservedResourceRegistrar(server, sink);
}

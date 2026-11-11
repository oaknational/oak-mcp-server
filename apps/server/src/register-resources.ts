/**
 * MCP Resource Registration — the declarative registration descriptor.
 *
 * One unit list is the single source of truth for BOTH the registrar
 * ({@link registerAllResources}) and the product-analytics label derivation
 * ({@link liveResourceRegistrationNames}): each unit derives its live
 * entries — analytics name and registrar call, paired in one value — from
 * the served-surface definition, so the gating knowledge cannot fork
 * between the two consumers (MCP-337; previously two hand-maintained
 * mirrors). Dormant rows are structurally absent from resources/list — the
 * single point of control per the mcp-101 ratified plan; no runtime flags.
 *
 * The per-resource registration bodies live in `resource-registrations.ts`.
 * The graph corpora have no whole-corpus resource form: prior knowledge,
 * misconceptions, and thread progressions are served by their anchored
 * tools (`get-prior-knowledge-graph`, `get-misconception-graph`,
 * `get-thread-progressions`).
 */

import {
  DOCUMENTATION_RESOURCES,
  CURRICULUM_MODEL_RESOURCE,
  EEF_INTERPRETATION_RESOURCE,
  AGENT_GUIDANCE_RESOURCES,
  WIDGET_URI,
} from '@oaknational/curriculum-sdk/public/mcp-tools.js';
import { isResourceLive, type ServedSurfaceDefinition } from './served-surface/served-surface.js';

import {
  type ResourceRegistrar,
  type ResourceRegistrationOptions,
} from './register-resource-helpers.js';
import { registerWidgetResource, WIDGET_RESOURCE_NAME } from './register-widget-resource.js';
import {
  registerAgentGuidanceResource,
  registerCurriculumModelResource,
  registerDocumentationResource,
  registerEefInterpretationResource,
} from './resource-registrations.js';

/** One live registration: the analytics label and the registrar call, paired. */
interface LiveRegistrationEntry {
  readonly name: string;
  readonly register: (server: ResourceRegistrar, options: ResourceRegistrationOptions) => void;
}

/** One gating unit: derives its live entries from the definition. */
interface ResourceRegistrationUnit {
  readonly liveEntries: (
    servedSurface: ServedSurfaceDefinition,
  ) => readonly LiveRegistrationEntry[];
}

/**
 * Registration units, in registration order. Gate semantics preserved
 * exactly from the pre-descriptor registrar: documentation is
 * all-or-nothing (`every` — one dormant row hides ALL doc resources);
 * agent guidance filters per row; every other unit gates on its single URI.
 */
const RESOURCE_REGISTRATION_UNITS: readonly ResourceRegistrationUnit[] = [
  {
    liveEntries: (servedSurface) =>
      DOCUMENTATION_RESOURCES.every((resource) => isResourceLive(servedSurface, resource.uri))
        ? DOCUMENTATION_RESOURCES.map((resource) => ({
            name: resource.name,
            register: (server) => registerDocumentationResource(server, resource),
          }))
        : [],
  },
  {
    liveEntries: (servedSurface) =>
      isResourceLive(servedSurface, CURRICULUM_MODEL_RESOURCE.uri)
        ? [
            {
              name: CURRICULUM_MODEL_RESOURCE.name,
              register: (server) => registerCurriculumModelResource(server),
            },
          ]
        : [],
  },
  {
    liveEntries: (servedSurface) =>
      isResourceLive(servedSurface, EEF_INTERPRETATION_RESOURCE.uri)
        ? [
            {
              name: EEF_INTERPRETATION_RESOURCE.name,
              register: (server) => registerEefInterpretationResource(server),
            },
          ]
        : [],
  },
  {
    liveEntries: (servedSurface) =>
      AGENT_GUIDANCE_RESOURCES.filter((resource) =>
        isResourceLive(servedSurface, resource.uri),
      ).map((resource) => ({
        name: resource.name,
        register: (server) => registerAgentGuidanceResource(server, resource),
      })),
  },
  {
    liveEntries: (servedSurface) =>
      isResourceLive(servedSurface, WIDGET_URI)
        ? [
            {
              name: WIDGET_RESOURCE_NAME,
              register: (server, options) => registerWidgetResource(server, options.getWidgetHtml),
            },
          ]
        : [],
  },
];

/**
 * Registers all static resources with the MCP server: every unit's live
 * entries register, in unit order.
 *
 * @param server - MCP server instance
 * @param options - Registration options carrying the definition
 */
export function registerAllResources(
  server: ResourceRegistrar,
  options: ResourceRegistrationOptions,
): void {
  for (const unit of RESOURCE_REGISTRATION_UNITS) {
    for (const entry of unit.liveEntries(options.servedSurface)) {
      entry.register(server, options);
    }
  }
}

/**
 * Canonical live resource registration names under a served-surface
 * definition — derived from the SAME unit entries {@link registerAllResources}
 * registers, so the set cannot drift from the registration path's gating
 * (MCP-241 closes the product-analytics resource labels to this set). The
 * registration-walk parity test remains the cross-module pin that each
 * entry's registrar actually registers under the entry's name.
 */
export function liveResourceRegistrationNames(
  servedSurface: ServedSurfaceDefinition,
): readonly string[] {
  return RESOURCE_REGISTRATION_UNITS.flatMap((unit) => unit.liveEntries(servedSurface)).map(
    (entry) => entry.name,
  );
}

export {
  registerCurriculumModelResource,
  registerDocumentationResources,
} from './resource-registrations.js';
export type { ResourceRegistrationOptions } from './register-resource-helpers.js';

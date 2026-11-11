/**
 * Per-resource registration functions.
 *
 * Each function registers ONE resource kind unconditionally — liveness
 * gating lives with the registration descriptor in `register-resources.ts`,
 * which pairs each registrar with the name it registers under so the
 * registrar and the analytics-label derivation cannot fork (MCP-337).
 */

import {
  DOCUMENTATION_RESOURCES,
  getDocumentationContent,
  CURRICULUM_MODEL_RESOURCE,
  getCurriculumModelJson,
  EEF_INTERPRETATION_RESOURCE,
  getEefInterpretationMarkdown,
  type AGENT_GUIDANCE_RESOURCES,
  getAgentGuidanceContent,
} from '@oaknational/curriculum-sdk/public/mcp-tools.js';

import { filterCurriculumModelJson } from './served-surface/filter-guidance-content.js';
import { type ResourceRegistrar } from './register-resource-helpers.js';

/**
 * Registers one documentation resource for the "start here" experience.
 *
 * The getting-started guide is the documentation resource exposed via
 * resources/list and resources/read. Tool categories, workflows, and tips are
 * single-sourced through the canonical `curriculum://model` resource (and the
 * `get-curriculum-model` tool), not duplicated as separate doc resources.
 *
 * @param server - MCP server instance
 * @param resource - The documentation resource row to register
 */
export function registerDocumentationResource(
  server: ResourceRegistrar,
  resource: (typeof DOCUMENTATION_RESOURCES)[number],
): void {
  const { name, uri, ...metadata } = resource;
  server.registerResource(name, uri, metadata, () => {
    const content = getDocumentationContent(uri);
    return {
      contents: [
        {
          uri,
          mimeType: resource.mimeType,
          text: content ?? `# ${resource.title}\n\nContent not found.`,
        },
      ],
    };
  });
}

/** Registers every documentation resource (ungated; the descriptor gates). */
export function registerDocumentationResources(server: ResourceRegistrar): void {
  for (const resource of DOCUMENTATION_RESOURCES) {
    registerDocumentationResource(server, resource);
  }
}

/** Registers the curriculum model as an MCP resource, complementing `get-curriculum-model`. */
export function registerCurriculumModelResource(server: ResourceRegistrar): void {
  const { name, uri, ...metadata } = CURRICULUM_MODEL_RESOURCE;
  server.registerResource(name, uri, metadata, () => ({
    contents: [
      {
        uri,
        mimeType: CURRICULUM_MODEL_RESOURCE.mimeType,
        // Serve-boundary filter: guidance tool references narrowed to the
        // served-surface's live entries (interim cure; MCP-121 replaces).
        text: filterCurriculumModelJson(getCurriculumModelJson()),
      },
    ],
  }));
}

/**
 * Registers the EEF interpretation resource (`eef://interpretation`).
 *
 * A static `text/markdown` reasoning scaffold for the EEF Toolkit evidence
 * (content built SDK-side; ADR-179). Registered only when the definition's
 * row is live — the descriptor gates.
 */
export function registerEefInterpretationResource(server: ResourceRegistrar): void {
  const { name, uri, ...metadata } = EEF_INTERPRETATION_RESOURCE;
  server.registerResource(name, uri, metadata, () => ({
    contents: [
      {
        uri,
        mimeType: EEF_INTERPRETATION_RESOURCE.mimeType,
        text: getEefInterpretationMarkdown(),
      },
    ],
  }));
}

/**
 * Registers one agent guidance resource (ungated; the descriptor filters
 * to the definition's live rows — the ratified live-set is the navigation
 * three; the creation four stay dormant until the definition deliberately
 * turns them live).
 */
export function registerAgentGuidanceResource(
  server: ResourceRegistrar,
  resource: (typeof AGENT_GUIDANCE_RESOURCES)[number],
): void {
  const { name, uri, title, description, mimeType, annotations, lastModified } = resource;
  server.registerResource(name, uri, { title, description, mimeType, annotations }, () => ({
    contents: [
      {
        uri,
        mimeType,
        text: getAgentGuidanceContent(uri) ?? `# ${title}\n\nContent not found.`,
        _meta: { lastModified },
      },
    ],
  }));
}

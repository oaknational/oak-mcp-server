/**
 * Inventory of the agent guidance resources — the six workflow guidance
 * documents, re-homed from the former user-invoked MCP prompts as
 * agent-readable resource documents (owner ruling, decisions register D11).
 *
 * This is the AVAILABLE inventory, not the served set: live-vs-dormant
 * classification is app-side policy, owned by the app's declarative
 * served-surface definition, which references these entries by URI. The
 * navigation/creation grouping constants below carry the ratified
 * partition so the app's classification can bind to it structurally.
 *
 * Relationship to the sibling catalogues:
 *
 * - `ALL_MCP_RESOURCES` (../all-resources.ts) remains the catalogue of
 *   resources the server REGISTERS today; guidance entries join it only
 *   when the app starts registering them (the served-surface lane), at
 *   which point the registration drift guard recomputes served == live.
 * - The curriculum model's `tool-guidance-workflows` serve terse,
 *   orientation-level workflow sketches via `get-curriculum-model`; these
 *   documents are the deep per-workflow guidance. Complementary depths by
 *   design: the model orients, these documents specify. Substance shared
 *   between them is sourced from the same underlying tool contracts, not
 *   duplicated prose.
 */

import type { AgentGuidanceResource } from './guidance-resource-types.js';
import { FIND_LESSONS_GUIDANCE, FIND_LESSONS_GUIDANCE_MARKDOWN } from './find-lessons.js';
import {
  EXPLORE_CURRICULUM_GUIDANCE,
  EXPLORE_CURRICULUM_GUIDANCE_MARKDOWN,
} from './explore-curriculum.js';
import {
  LEARNING_PROGRESSION_GUIDANCE,
  LEARNING_PROGRESSION_GUIDANCE_MARKDOWN,
} from './learning-progression.js';
import {
  CURRICULUM_MAPPING_GUIDANCE,
  CURRICULUM_MAPPING_GUIDANCE_MARKDOWN,
} from './curriculum-mapping.js';
import { ADAPT_LESSON_GUIDANCE, ADAPT_LESSON_GUIDANCE_MARKDOWN } from './adapt-lesson.js';
import {
  CONTINUE_PROGRESSION_GUIDANCE,
  CONTINUE_PROGRESSION_GUIDANCE_MARKDOWN,
} from './continue-progression.js';

export type { AgentGuidanceResource } from './guidance-resource-types.js';

/**
 * Every agent guidance document, in workflow order: the navigation three,
 * then the creation-oriented three.
 */
export const AGENT_GUIDANCE_RESOURCES: readonly AgentGuidanceResource[] = [
  FIND_LESSONS_GUIDANCE,
  EXPLORE_CURRICULUM_GUIDANCE,
  LEARNING_PROGRESSION_GUIDANCE,
  CURRICULUM_MAPPING_GUIDANCE,
  ADAPT_LESSON_GUIDANCE,
  CONTINUE_PROGRESSION_GUIDANCE,
];

/**
 * The navigation three (ratified live-set, decisions register D11):
 * navigation-oriented guidance consistent with the release's
 * no-creation-claims boundary.
 */
export const NAVIGATION_GUIDANCE_URIS: readonly string[] = [
  FIND_LESSONS_GUIDANCE.uri,
  EXPLORE_CURRICULUM_GUIDANCE.uri,
  LEARNING_PROGRESSION_GUIDANCE.uri,
];

/**
 * The creation-oriented three (dormant, decisions register D11 as amended
 * by the owner 2026-07-23: the lesson-planning placeholder is deleted
 * outright): retained in full as concepts to explore, served only when
 * the app's allowlist deliberately turns them live.
 */
export const CREATION_GUIDANCE_URIS: readonly string[] = [
  CURRICULUM_MAPPING_GUIDANCE.uri,
  ADAPT_LESSON_GUIDANCE.uri,
  CONTINUE_PROGRESSION_GUIDANCE.uri,
];

const CONTENT_BY_URI: ReadonlyMap<string, string> = new Map([
  [FIND_LESSONS_GUIDANCE.uri, FIND_LESSONS_GUIDANCE_MARKDOWN],
  [EXPLORE_CURRICULUM_GUIDANCE.uri, EXPLORE_CURRICULUM_GUIDANCE_MARKDOWN],
  [LEARNING_PROGRESSION_GUIDANCE.uri, LEARNING_PROGRESSION_GUIDANCE_MARKDOWN],
  [CURRICULUM_MAPPING_GUIDANCE.uri, CURRICULUM_MAPPING_GUIDANCE_MARKDOWN],
  [ADAPT_LESSON_GUIDANCE.uri, ADAPT_LESSON_GUIDANCE_MARKDOWN],
  [CONTINUE_PROGRESSION_GUIDANCE.uri, CONTINUE_PROGRESSION_GUIDANCE_MARKDOWN],
]);

/**
 * Returns the markdown body for an agent guidance resource URI, or
 * `undefined` when the URI is not in the inventory.
 */
export function getAgentGuidanceContent(uri: string): string | undefined {
  return CONTENT_BY_URI.get(uri);
}

/**
 * Programme-navigation workflow definitions for tool usage guidance.
 *
 * Extracted from tool-guidance-workflows.ts to keep both files within ESLint
 * max-lines limits (the same reason tool-guidance-workflows.ts was itself split
 * from tool-guidance-data.ts). Composed back into `toolGuidanceWorkflows` via a
 * spread, so consumers see one flat workflow map.
 *
 * @remarks All content is static and added at SDK compile time, complying with
 * schema-first principles.
 *
 * @see `./tool-guidance-types.ts` for type definitions
 */

import type { Workflow } from './tool-guidance-types.js';

/**
 * Workflows for navigating the curriculum by programme — the contextualised,
 * teacher-facing view of a single subject / key-stage / year-group pathway.
 * Co-equal with the sequence route (see the ontology's programmesVsSequences).
 */
export const programmeWorkflows = {
  byProgramme: {
    title: 'Navigate by programme (teacher-facing pathway)',
    description:
      'Find and drill into a single programme — the contextualised view of one subject / key-stage / ' +
      'year-group pathway that a teacher navigates by. Co-equal with the sequence route; use this when ' +
      'the task is a single user-facing pathway rather than structural, cross-programme traversal.',
    steps: [
      {
        step: 1,
        action: "Discover a subject's programmes",
        tool: 'get-subjects-programmes',
        example: 'get-subjects-programmes({ subject: "english" })',
        returns:
          'A flat array of full-form programme slug strings (e.g. english-primary-year-1, ' +
          'english-secondary-year-10-edexcel) — slugs only, no per-programme metadata; the year ' +
          'group and factors (tier, exam board, child subject) come from get-programmes in step 2',
      },
      {
        step: 2,
        action: "Get one programme's metadata by its slug",
        tool: 'get-programmes',
        example: 'get-programmes({ programme: "english-primary-year-1" })',
        returns:
          "The programme's year group, key stage, phase, and nullable tier / exam board / pathway",
      },
      {
        step: 3,
        action: "Fetch the programme's units, questions, or assets",
        tool: 'get-programmes-units',
        example: 'get-programmes-units({ programme: "english-primary-year-1" })',
        returns:
          'Units within the programme (companions: get-programmes-questions, get-programmes-assets)',
      },
    ],
  } satisfies Workflow,
} as const;

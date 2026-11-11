/**
 * Agent guidance: exploring a topic across the whole curriculum.
 *
 * Navigation guidance (the served live-set): grounds the assistant's
 * topic exploration in the parallel explore-topic tool and scoped search.
 */

import type { AgentGuidanceResource } from './guidance-resource-types.js';

export const EXPLORE_CURRICULUM_GUIDANCE: AgentGuidanceResource = {
  name: 'guidance-explore-curriculum',
  uri: 'docs://oak/guidance/explore-curriculum.md',
  title: 'Agent guidance: explore the curriculum',
  description:
    'Workflow guidance for the assistant: explore what Oak has on a topic across lessons, units, and threads in parallel, then drill into the most relevant results.',
  mimeType: 'text/markdown',
  annotations: { priority: 0.4, audience: ['assistant'] },
  lastModified: '2026-07-23T00:00:00Z',
};

export const EXPLORE_CURRICULUM_GUIDANCE_MARKDOWN = `# Explore the curriculum — agent workflow guidance

Follow this workflow when a teacher wants to explore what Oak has about a
topic. Substitute the teacher's own topic for \`<topic>\`; if they name a
subject, carry it as the \`subject\` filter.

Call \`get-curriculum-model\` first for domain definitions and tool guidance.

1. Use \`explore-topic\` to search across lessons, units, and threads in
   parallel: \`explore-topic({ query: "<topic>" })\` — add
   \`subject: "<subject>"\` when the teacher named one.
2. Review the topic map and summarise what is available.
3. For the most relevant results, drill down using \`search\` with a
   specific scope.
4. If there are learning threads, note how the topic develops across year
   groups.
5. Suggest next steps based on what you find.
`;

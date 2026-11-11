/**
 * Agent guidance: finding lessons on a topic.
 *
 * Navigation guidance (the served live-set): grounds the assistant's
 * lesson-finding workflow in Oak's search and fetch tools.
 */

import type { AgentGuidanceResource } from './guidance-resource-types.js';

export const FIND_LESSONS_GUIDANCE: AgentGuidanceResource = {
  name: 'guidance-find-lessons',
  uri: 'docs://oak/guidance/find-lessons.md',
  title: 'Agent guidance: find lessons',
  description:
    'Workflow guidance for the assistant: find curriculum lessons on a topic the teacher names, across all subjects and key stages, and surface the most relevant with summaries.',
  mimeType: 'text/markdown',
  annotations: { priority: 0.4, audience: ['assistant'] },
  lastModified: '2026-07-23T00:00:00Z',
};

export const FIND_LESSONS_GUIDANCE_MARKDOWN = `# Find lessons — agent workflow guidance

Follow this workflow when a teacher wants to find Oak lessons about a topic.
Substitute the teacher's own topic wherever a placeholder like \`<topic>\`
appears; if they name a key stage, carry it as the \`keyStage\` filter.

Before searching, call \`get-curriculum-model\` for a complete understanding
of the curriculum domain model and available tools.

1. Use \`search\` with scope \`"lessons"\` to find lessons matching the topic:
   \`search({ query: "<topic>", scope: "lessons" })\` — add
   \`keyStage: "<keyStage>"\` when the teacher named one (e.g. \`"ks1"\`,
   \`"ks2"\`, \`"ks3"\`, \`"ks4"\`).
2. Review the results and identify the most relevant lessons.
3. For the top 3-5 lessons, provide a brief summary of what each covers.
4. Suggest which lesson might be best for different learning objectives.
5. Use \`fetch\` to get full details for the most promising lesson.
`;

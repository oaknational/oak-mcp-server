import { describe, expect, it } from 'vitest';
import { AGENT_GUIDANCE_RESOURCES } from '@oaknational/curriculum-sdk/public/mcp-tools.js';
import { buildGuidanceRegistrationEvidenceByUri } from './current-source-guidance-registration-evidence.js';

describe('buildGuidanceRegistrationEvidenceByUri', () => {
  const [liveGuidance, dormantGuidance] = AGENT_GUIDANCE_RESOURCES;

  it('reports observed list and read channels only for live resources', () => {
    expect(liveGuidance).toBeDefined();
    expect(dormantGuidance).toBeDefined();
    if (liveGuidance === undefined || dormantGuidance === undefined) {
      throw new Error('Current-source guidance fixture requires two resources');
    }
    const policy = Object.fromEntries(
      AGENT_GUIDANCE_RESOURCES.map(({ uri }) => [
        uri,
        uri === liveGuidance.uri ? ('live' as const) : ('dormant' as const),
      ]),
    );

    const evidence = buildGuidanceRegistrationEvidenceByUri(policy);

    expect(evidence[liveGuidance.uri]?.channels).toEqual([
      'resources/list.resources[]',
      'resources/read.contents[]',
    ]);
    expect(evidence[dormantGuidance.uri]?.channels).toEqual([]);
    expect(evidence[liveGuidance.uri]?.surfaces).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          locus: 'resource-metadata',
          field: 'name',
        }),
        expect.objectContaining({
          locus: 'resource-metadata',
          field: 'uri',
        }),
        expect.objectContaining({
          locus: 'resource-metadata',
          field: 'title',
        }),
        expect.objectContaining({
          locus: 'resource-metadata',
          field: 'description',
        }),
        expect.objectContaining({
          locus: 'resource-metadata',
          field: 'mimeType',
        }),
        expect.objectContaining({
          locus: 'resource-metadata',
          field: 'annotations',
        }),
        expect.objectContaining({
          locus: 'resource-contents',
          field: 'uri',
        }),
        expect.objectContaining({
          locus: 'resource-contents',
          field: 'mimeType',
        }),
        expect.objectContaining({
          locus: 'resource-contents',
          field: 'text',
        }),
        expect.objectContaining({
          locus: 'resource-contents',
          field: '_meta.lastModified',
        }),
      ]),
    );
  });
});

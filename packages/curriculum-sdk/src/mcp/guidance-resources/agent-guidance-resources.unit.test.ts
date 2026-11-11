/**
 * Unit tests for the agent guidance resource inventory.
 *
 * The inventory is the SDK-side catalogue of the six workflow guidance
 * documents (owner-ratified live-set classification happens app-side via
 * the served-surface allowlist; this inventory carries no live/dormant
 * state of its own — it is the full available set).
 */

import { describe, it, expect } from 'vitest';
import {
  AGENT_GUIDANCE_RESOURCES,
  NAVIGATION_GUIDANCE_URIS,
  CREATION_GUIDANCE_URIS,
  getAgentGuidanceContent,
} from './agent-guidance-resources.js';

const EXPECTED_URIS = [
  'docs://oak/guidance/find-lessons.md',
  'docs://oak/guidance/explore-curriculum.md',
  'docs://oak/guidance/learning-progression.md',
  'docs://oak/guidance/curriculum-mapping.md',
  'docs://oak/guidance/adapt-lesson.md',
  'docs://oak/guidance/continue-progression.md',
] as const;

describe('AGENT_GUIDANCE_RESOURCES', () => {
  it('lists exactly the six workflow guidance documents with unique names and URIs', () => {
    expect(AGENT_GUIDANCE_RESOURCES).toHaveLength(6);
    const uris = AGENT_GUIDANCE_RESOURCES.map((r) => r.uri);
    expect(new Set(uris)).toEqual(new Set(EXPECTED_URIS));
    expect(new Set(AGENT_GUIDANCE_RESOURCES.map((r) => r.name)).size).toBe(6);
  });

  it('gives every entry agent-audience markdown metadata with spec-shaped annotations', () => {
    for (const resource of AGENT_GUIDANCE_RESOURCES) {
      expect(resource.mimeType).toBe('text/markdown');
      expect(resource.annotations.audience).toEqual(['assistant']);
      expect(resource.annotations.priority).toBeGreaterThan(0);
      expect(resource.annotations.priority).toBeLessThanOrEqual(1);
      expect(resource.title.length).toBeGreaterThan(0);
      expect(resource.description.length).toBeGreaterThan(0);
      expect(resource.lastModified).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
  });

  it('partitions the full set into the navigation three and the creation three, disjointly', () => {
    expect(NAVIGATION_GUIDANCE_URIS).toHaveLength(3);
    expect(CREATION_GUIDANCE_URIS).toHaveLength(3);
    const union = new Set([...NAVIGATION_GUIDANCE_URIS, ...CREATION_GUIDANCE_URIS]);
    expect(union.size).toBe(6);
    expect(union).toEqual(new Set(EXPECTED_URIS));
    expect(NAVIGATION_GUIDANCE_URIS).toEqual([
      'docs://oak/guidance/find-lessons.md',
      'docs://oak/guidance/explore-curriculum.md',
      'docs://oak/guidance/learning-progression.md',
    ]);
  });

  it('carries source-skill provenance on the document derived from oak-skills', () => {
    const curriculumMapping = AGENT_GUIDANCE_RESOURCES.find(
      (r) => r.uri === 'docs://oak/guidance/curriculum-mapping.md',
    );
    expect(curriculumMapping?._meta?.provenance).toContain('oak-curriculum-mapper');
  });
});

describe('getAgentGuidanceContent', () => {
  it('serves a non-empty markdown document for every inventory URI', () => {
    for (const uri of EXPECTED_URIS) {
      const content = getAgentGuidanceContent(uri);
      expect(content, uri).toBeDefined();
      expect(content).toMatch(/^# /);
    }
  });

  it('returns undefined for a URI outside the inventory', () => {
    expect(getAgentGuidanceContent('docs://oak/guidance/unknown.md')).toBeUndefined();
  });

  it('serves fully static guidance — no unresolved template interpolation', () => {
    for (const uri of EXPECTED_URIS) {
      expect(getAgentGuidanceContent(uri)).not.toContain('${');
    }
  });

  it('keeps the orientation-first discipline in every document', () => {
    for (const uri of EXPECTED_URIS) {
      expect(getAgentGuidanceContent(uri), uri).toContain('get-curriculum-model');
    }
  });

  it('preserves the OGL attribution obligation on every document grounded in Oak data reuse', () => {
    const attributionCarrying = [
      'docs://oak/guidance/curriculum-mapping.md',
      'docs://oak/guidance/adapt-lesson.md',
      'docs://oak/guidance/continue-progression.md',
    ] as const;
    for (const uri of attributionCarrying) {
      expect(getAgentGuidanceContent(uri), uri).toContain('Open Government Licence');
    }
  });
});

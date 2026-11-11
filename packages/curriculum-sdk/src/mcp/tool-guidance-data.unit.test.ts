/**
 * Unit tests for tool guidance data content quality.
 *
 * These tests validate the content requirements of the tool guidance data,
 * not the structure (TypeScript handles type correctness).
 */

import { describe, it, expect } from 'vitest';
import { toolGuidanceData } from './tool-guidance-data.js';
import { AGENT_SUPPORT_TOOL_NAMES } from './agent-support-tool-metadata.js';

describe('toolGuidanceData content quality', () => {
  it('agentSupport category includes all agent support tools', () => {
    for (const name of AGENT_SUPPORT_TOOL_NAMES) {
      expect(toolGuidanceData.toolCategories.agentSupport.tools).toContain(name);
    }
  });

  it('agentSupport category has isAgentSupport flag set to true', () => {
    expect(toolGuidanceData.toolCategories.agentSupport.isAgentSupport).toBe(true);
  });

  it('discovery category includes semantic search tools', () => {
    expect(toolGuidanceData.toolCategories.discovery.tools).toContain('search');
    expect(toolGuidanceData.toolCategories.discovery.tools).toContain('explore-topic');
    expect(toolGuidanceData.toolCategories.discovery.tools).toContain('browse-curriculum');
  });

  it('fetching category includes fetch tool', () => {
    expect(toolGuidanceData.toolCategories.fetching.tools).toContain('fetch');
  });

  it('progression category includes get-threads', () => {
    expect(toolGuidanceData.toolCategories.progression.tools).toContain('get-threads');
  });

  it('programmes category surfaces the programme tools so they are discoverable', () => {
    expect(toolGuidanceData.toolCategories.programmes.tools).toContain('get-subjects-programmes');
    expect(toolGuidanceData.toolCategories.programmes.tools).toContain('get-programmes');
  });

  it('programmes category frames programme and sequence routes as co-equal (D2)', () => {
    // Co-equal means the programme category explains when to use each route,
    // and the sequence route is NOT demoted out of the browsing category.
    expect(toolGuidanceData.toolCategories.programmes.whenToUse).toMatch(/sequence/i);
    expect(toolGuidanceData.toolCategories.browsing.tools).toContain('get-sequences');
  });

  it('byProgramme workflow starts at get-subjects-programmes and drills into get-programmes', () => {
    const workflow = toolGuidanceData.workflows.byProgramme;
    expect(workflow.steps[0].tool).toBe('get-subjects-programmes');
    const toolsUsed = workflow.steps.map((step) => step.tool);
    expect(toolsUsed).toContain('get-programmes');
  });

  it('findLessons workflow starts with search', () => {
    const firstStep = toolGuidanceData.workflows.findLessons.steps[0];
    expect(firstStep.tool).toBe('search');
  });

  it('tips include guidance about fetch tool ID formats', () => {
    const hasFetchTip = toolGuidanceData.tips.some(
      (tip) => tip.includes('fetch') || tip.includes('prefix'),
    );
    expect(hasFetchTip).toBe(true);
  });

  it('tips include orientation guidance referencing get-curriculum-model', () => {
    const hasOrientationTip = toolGuidanceData.tips.some((tip) =>
      tip.includes('get-curriculum-model'),
    );
    expect(hasOrientationTip).toBe(true);
  });
});

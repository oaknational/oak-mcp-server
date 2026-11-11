import { describe, it, expect } from 'vitest';
import type { ToolName } from '@oaknational/sdk-codegen/mcp-tools';
import { z } from 'zod';
import { listUniversalTools } from './universal-tools/list-tools.js';
import { isAppToolEntry, isUniversalToolName } from './universal-tools/type-guards.js';
import { AGGREGATED_TOOL_DEFS } from './universal-tools/definitions.js';
import { ontologyData } from './ontology-data.js';
import { typeSafeKeys } from '../types/helpers/type-helpers.js';
import type {
  GeneratedToolRegistry,
  ToolRegistryDescriptor,
  UniversalToolName,
} from './universal-tools/types.js';

const AGGREGATED_TOOL_NAMES_FROM_DEFS = typeSafeKeys(AGGREGATED_TOOL_DEFS);

describe('AGGREGATED_TOOL_DEFS contains expected tools', () => {
  it('contains get-curriculum-model as the sole orientation tool', () => {
    expect(AGGREGATED_TOOL_NAMES_FROM_DEFS).toContain('get-curriculum-model');
  });
});

const sampleMcpToolName = 'get-key-stages-subject-lessons' as const satisfies ToolName;

const sampleDescriptor: ToolRegistryDescriptor = {
  description: 'List lessons for a subject',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      params: {
        type: 'object',
        additionalProperties: false,
        properties: {
          path: {
            type: 'object',
            additionalProperties: false,
            properties: {
              keyStage: { type: 'string' },
              subject: { type: 'string' },
            },
          },
        },
      },
    },
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
    title: 'Get Lessons',
  },
  securitySchemes: [],
  _meta: { securitySchemes: [] },
  toolMcpFlatInputSchema: z.object({
    params: z.object({
      path: z.object({
        keyStage: z.string(),
        subject: z.string(),
      }),
    }),
  }),
};

function createFakeRegistry(): GeneratedToolRegistry {
  return {
    toolNames: [sampleMcpToolName],
    getToolFromToolName: () => sampleDescriptor,
    isToolName: (value: unknown): value is ToolName =>
      typeof value === 'string' && value === sampleMcpToolName,
  };
}

const registry = createFakeRegistry();
const SAMPLE_MCP_TOOL_NAME: UniversalToolName = sampleMcpToolName;

describe('listUniversalTools', () => {
  it('includes aggregated helpers', () => {
    const tools = listUniversalTools(registry);
    const names = tools.map((tool) => tool.name);
    expect(names).toContain('search');
    expect(names).toContain('fetch');
  });

  it('includes generated curriculum tools', () => {
    const tools = listUniversalTools(registry);
    const names = tools.map((tool) => tool.name);
    expect(names).toContain(SAMPLE_MCP_TOOL_NAME);
  });

  it('always includes download-asset', () => {
    const tools = listUniversalTools(registry);
    const names = tools.map((tool) => tool.name);
    expect(names).toContain('download-asset');
  });

  it('preserves aggregator schema metadata', () => {
    const tools = listUniversalTools(registry);
    const searchTool = tools.find((tool) => tool.name === 'search');
    expect(searchTool).toBeDefined();
    expect(searchTool?.inputSchema).toBe(AGGREGATED_TOOL_DEFS.search.inputSchema);
  });
});

describe('isUniversalToolName', () => {
  it('matches aggregated tool names', () => {
    expect(isUniversalToolName('search', registry.isToolName)).toBe(true);
    expect(isUniversalToolName('fetch', registry.isToolName)).toBe(true);
    expect(isUniversalToolName('get-curriculum-model', registry.isToolName)).toBe(true);
    expect(isUniversalToolName('get-thread-progressions', registry.isToolName)).toBe(true);
    expect(isUniversalToolName('get-prior-knowledge-graph', registry.isToolName)).toBe(true);
    expect(isUniversalToolName('browse-curriculum', registry.isToolName)).toBe(true);
    expect(isUniversalToolName('explore-topic', registry.isToolName)).toBe(true);
    expect(isUniversalToolName('download-asset', registry.isToolName)).toBe(true);
  });

  it('matches curriculum tool names', () => {
    expect(isUniversalToolName(SAMPLE_MCP_TOOL_NAME, registry.isToolName)).toBe(true);
  });

  it('rejects unknown names', () => {
    expect(isUniversalToolName('unknown-tool', registry.isToolName)).toBe(false);
  });
});

describe('listUniversalTools embedded-app registration hints', () => {
  it('get-curriculum-model and user-search are app-tool entries; agent search is not', () => {
    const tools = listUniversalTools(registry);
    const orientation = tools.find((t) => t.name === 'get-curriculum-model');
    const userSearch = tools.find((t) => t.name === 'user-search');
    const search = tools.find((t) => t.name === 'search');

    expect(orientation).toBeDefined();
    expect(userSearch).toBeDefined();
    expect(search).toBeDefined();
    if (orientation && isAppToolEntry(orientation)) {
      expect(orientation._meta.ui.resourceUri).toMatch(/^ui:\/\/widget\//);
    } else {
      expect.fail('get-curriculum-model should be an app-tool entry with a widget URI');
    }
    if (userSearch && isAppToolEntry(userSearch)) {
      expect(userSearch._meta.ui.resourceUri).toMatch(/^ui:\/\/widget\//);
    } else {
      expect.fail('user-search should be an app-tool entry with a widget URI');
    }
    if (search) {
      expect(isAppToolEntry(search)).toBe(false);
    }
  });
});

describe('search and fetch descriptions', () => {
  it('search description includes "Use this when" guidance', () => {
    const tools = listUniversalTools(registry);
    const tool = tools.find((t) => t.name === 'search');
    expect(tool?.description).toContain('Use this when');
    expect(tool?.description).toContain('Do NOT use');
  });

  it('fetch description includes "Use this when" guidance', () => {
    const tools = listUniversalTools(registry);
    const tool = tools.find((t) => t.name === 'fetch');
    expect(tool?.description).toContain('Use this when');
    expect(tool?.description).toContain('Do NOT use');
  });
});

describe('ontologyData', () => {
  it('fits context budget (<70KB) for LLM tool-calling', () => {
    const ontologySize = JSON.stringify(ontologyData).length;
    expect(ontologySize).toBeLessThan(70000);
  });
});

describe('hand-authored annotations parity (MCP-300)', () => {
  // Clients that read only `annotations` (the directory review surface among
  // them) see no display name unless `annotations.title` is set — the
  // generated path carries it from codegen, so the hand-authored path must
  // mirror its display title or the two paths silently diverge.
  it('every aggregated definition mirrors its display title into annotations.title', () => {
    for (const name of AGGREGATED_TOOL_NAMES_FROM_DEFS) {
      const def = AGGREGATED_TOOL_DEFS[name];
      expect(def.annotations.title, `annotations.title on ${name}`).toBe(def.title);
      expect(def.title.length, `display title on ${name} must be non-empty`).toBeGreaterThan(0);
    }
  });

  // Directory compliance (acknowledgement 5): descriptions must not instruct
  // the model about its own behaviour or about other tools. The banned class
  // is the imperative prerequisite — "PREREQUISITE: You MUST call X first"
  // and the softer "(use 'X' first)" sequencing alike — guarded by
  // case-insensitive patterns; ordinary routing cross-references
  // ("Not for X — use Y", no sequencing imperative) stay. The `instructions`
  // field carries the orientation guidance.
  it('no aggregated description carries an imperative call-another-tool-first instruction', () => {
    const bannedDescriptionGuidance = [
      /prerequisite:/i,
      /you must call/i,
      /\b(?:use|call) '[^']+' first\b/i,
    ];
    for (const name of AGGREGATED_TOOL_NAMES_FROM_DEFS) {
      const def = AGGREGATED_TOOL_DEFS[name];
      for (const pattern of bannedDescriptionGuidance) {
        expect(def.description, `description on ${name}`).not.toMatch(pattern);
      }
    }
  });
});

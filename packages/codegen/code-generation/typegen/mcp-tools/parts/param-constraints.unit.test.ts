import { describe, it, expect } from 'vitest';
import {
  findUnpropagatedValidationKeywords,
  UNPROPAGATED_VALIDATION_KEYWORDS,
} from './param-constraints.js';

/**
 * Unit tests for the unpropagated-constraint detector.
 *
 * The MCP tool generator translates a subset of OpenAPI parameter schema
 * keywords into the JSON Schema and Zod surfaces it emits. Anything outside
 * that subset used to vanish silently, so `tools/list` advertised a looser
 * contract than the API honours (the dropped `maximum: 300` on `limit`).
 * This detector makes the drop loud: generation fails rather than shipping
 * a validation gap.
 *
 * Annotations that do not change what a request accepts (`format`,
 * `description`, `example`, `title`, `deprecated`) are deliberately not
 * treated as constraints.
 */
describe('findUnpropagatedValidationKeywords', () => {
  it('reports nothing for a schema using only propagated keywords', () => {
    expect(
      findUnpropagatedValidationKeywords({
        type: 'number',
        description: 'Limit the number of keywords',
        default: 20,
        example: 20,
        minimum: 1,
        maximum: 300,
        enum: [1, 2, 3],
      }),
    ).toEqual([]);
  });

  it('reports nothing for annotation-only keywords', () => {
    expect(
      findUnpropagatedValidationKeywords({
        type: 'string',
        format: 'date',
        title: 'Start date',
        deprecated: true,
      }),
    ).toEqual([]);
  });

  it('reports a single unpropagated validation keyword', () => {
    expect(findUnpropagatedValidationKeywords({ type: 'string', pattern: '^[a-z]+$' })).toEqual([
      'pattern',
    ]);
  });

  it('reports every unpropagated validation keyword present, in a stable order', () => {
    expect(
      findUnpropagatedValidationKeywords({
        type: 'number',
        multipleOf: 5,
        exclusiveMaximum: 300,
      }),
    ).toEqual(['exclusiveMaximum', 'multipleOf']);
  });

  it('recognises every keyword the module declares unpropagated', () => {
    for (const keyword of UNPROPAGATED_VALIDATION_KEYWORDS) {
      expect(findUnpropagatedValidationKeywords({ [keyword]: 1 })).toEqual([keyword]);
    }
  });

  it('reports nothing for an empty schema', () => {
    expect(findUnpropagatedValidationKeywords({})).toEqual([]);
  });
});

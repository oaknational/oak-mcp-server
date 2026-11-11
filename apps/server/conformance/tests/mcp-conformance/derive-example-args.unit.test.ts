import { unwrap, unwrapErr } from '@oaknational/result';
import { describe, expect, it } from 'vitest';

import { deriveExampleArgs } from '../../src/mcp-conformance/derive-example-args.js';

// Wire-shaped tool input schemas: what tools/list actually advertises after
// the zod .meta({ examples }) → z.toJSONSchema flow (e2e-proven property
// `examples` arrays; `required` from non-optional properties).
describe('deriveExampleArgs — example inputs come from the advertised schema, never guessed', () => {
  it('takes the first example for every required property', () => {
    const result = deriveExampleArgs('download-asset', {
      type: 'object',
      properties: {
        lesson: { type: 'string', examples: ['adding-fractions-with-the-same-denominator'] },
        type: { type: 'string', examples: ['slideDeck', 'worksheet'] },
      },
      required: ['lesson', 'type'],
    });
    expect(unwrap(result)).toEqual({
      lesson: 'adding-fractions-with-the-same-denominator',
      type: 'slideDeck',
    });
  });

  it('a tool with no required properties derives the empty invocation — optionals are never included', () => {
    // A no-required-properties tool still gets a minimal call: {} — the
    // honest minimal invocation is the empty object, not invented optionals.
    const result = deriveExampleArgs('get-key-stages', {
      type: 'object',
      properties: {
        keyStage: { type: 'string', examples: ['ks2'] },
      },
      required: [],
    });
    expect(unwrap(result)).toEqual({});
  });

  it('a schema with no properties derives the empty invocation', () => {
    const result = deriveExampleArgs('get-curriculum-model', {
      type: 'object',
      properties: {},
    });
    expect(unwrap(result)).toEqual({});
  });

  it('a required property WITHOUT an example is a loud failure naming the tool and property', () => {
    const result = deriveExampleArgs('search', {
      type: 'object',
      properties: {
        query: { type: 'string' },
        scope: { type: 'string', examples: ['lessons'] },
      },
      required: ['query', 'scope'],
    });
    expect(unwrapErr(result)).toContain('search');
    expect(unwrapErr(result)).toContain('query');
    expect(unwrapErr(result)).toContain('no example');
  });

  it('a non-object or malformed schema is a loud failure naming the tool', () => {
    const result = deriveExampleArgs('broken-tool', { type: 'string' });
    expect(unwrapErr(result)).toContain('broken-tool');
  });
});

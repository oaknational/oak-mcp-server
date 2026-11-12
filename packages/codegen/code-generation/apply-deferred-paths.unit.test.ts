import { describe, expect, it } from 'vitest';
import type { OpenAPIObject } from 'openapi3-ts/oas31';

import { applyDeferredPaths } from './apply-deferred-paths.js';
import type { DeferredPathEntry } from './excluded-paths.js';

const DEFERRED_FIXTURE_ENTRIES: readonly DeferredPathEntry[] = [
  { path: '/alpha/deferred', ticket: 'TEST-1' },
  { path: '/beta/{id}/deferred', ticket: 'TEST-2' },
];

/**
 * Four paths: two deferred, one near-miss of a deferred path (kills any
 * substring/startsWith implementation), one plain survivor. Survivors carry
 * non-trivial nesting so preservation is proven on real structure.
 */
function buildSchemaWithDeferredPaths(): OpenAPIObject {
  return {
    openapi: '3.1.0',
    info: { title: 'Test API', version: '1.0.0' },
    paths: {
      '/alpha/deferred': {
        post: {
          operationId: 'alpha-deferred',
          responses: { '200': { description: 'OK' } },
        },
      },
      '/alpha/deferred-summary': {
        get: {
          operationId: 'alpha-deferred-summary',
          parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } }],
          responses: {
            '200': {
              description: 'OK',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/summary' },
                },
              },
            },
          },
        },
      },
      '/beta/{id}/deferred': {
        get: {
          operationId: 'beta-deferred',
          responses: { '200': { description: 'OK' } },
        },
      },
      '/plain': {
        post: {
          operationId: 'plain-post',
          requestBody: {
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/summary' },
              },
            },
          },
          responses: { '200': { description: 'OK' } },
        },
      },
    },
    components: {
      schemas: {
        summary: {
          type: 'object',
          required: ['title'],
          properties: { title: { type: 'string' } },
        },
      },
    },
  };
}

describe('applyDeferredPaths', () => {
  it('removes exactly the deferred paths from the returned document', () => {
    const result = applyDeferredPaths(buildSchemaWithDeferredPaths(), DEFERRED_FIXTURE_ENTRIES);

    expect(Object.keys(result.paths ?? {}).sort((a, b) => a.localeCompare(b))).toStrictEqual([
      '/alpha/deferred-summary',
      '/plain',
    ]);
  });

  it('preserves non-deferred content and the rest of the document', () => {
    const input = buildSchemaWithDeferredPaths();

    const result = applyDeferredPaths(input, DEFERRED_FIXTURE_ENTRIES);

    expect(result.paths?.['/alpha/deferred-summary']).toStrictEqual(
      input.paths?.['/alpha/deferred-summary'],
    );
    expect(result.paths?.['/plain']).toStrictEqual(input.paths?.['/plain']);
    expect(result.components).toStrictEqual(input.components);
    expect(result.info).toStrictEqual(input.info);
  });

  it.each([
    { missing: '/alpha/deferred', ticket: 'TEST-1' },
    { missing: '/beta/{id}/deferred', ticket: 'TEST-2' },
  ])(
    'throws naming the missing path and its ticket when $missing is absent',
    ({ missing, ticket }) => {
      const input = buildSchemaWithDeferredPaths();
      delete input.paths?.[missing];

      expect(() => applyDeferredPaths(input, DEFERRED_FIXTURE_ENTRIES)).toThrow(missing);
      expect(() => applyDeferredPaths(input, DEFERRED_FIXTURE_ENTRIES)).toThrow(ticket);
    },
  );

  it('does not mutate the input document', () => {
    const input = buildSchemaWithDeferredPaths();
    const snapshot = structuredClone(input);

    applyDeferredPaths(input, DEFERRED_FIXTURE_ENTRIES);

    expect(input).toStrictEqual(snapshot);
  });
});

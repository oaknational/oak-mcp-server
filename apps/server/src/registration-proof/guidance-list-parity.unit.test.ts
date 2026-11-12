import { describe, expect, it } from 'vitest';
import { requireGuidanceListParity } from './guidance-list-parity.js';

const guidance = {
  name: 'guidance-example',
  uri: 'docs://oak/guidance/example.md',
  title: 'Example guidance',
  description: 'Example description',
  mimeType: 'text/markdown',
  annotations: { priority: 0.4, audience: ['assistant'] as const },
} as const;
const guidanceWithUnexpectedMeta = { ...guidance, _meta: { unexpected: true } };

describe('requireGuidanceListParity', () => {
  it('accepts exact live guidance metadata', () => {
    expect(() =>
      requireGuidanceListParity([guidance], [guidance], new Set([guidance.uri])),
    ).not.toThrow();
  });

  it('rejects changed live guidance metadata', () => {
    expect(() =>
      requireGuidanceListParity(
        [guidance],
        [{ ...guidance, title: 'Changed title' }],
        new Set([guidance.uri]),
      ),
    ).toThrow('Guidance listing differs from canonical metadata');
  });

  it('does not treat object key order as a metadata change', () => {
    expect(() =>
      requireGuidanceListParity(
        [guidance],
        [
          {
            ...guidance,
            annotations: {
              audience: guidance.annotations.audience,
              priority: guidance.annotations.priority,
            },
          },
        ],
        new Set([guidance.uri]),
      ),
    ).not.toThrow();
  });

  it('rejects unexpected descriptor fields', () => {
    expect(() =>
      requireGuidanceListParity([guidance], [guidanceWithUnexpectedMeta], new Set([guidance.uri])),
    ).toThrow('Guidance listing differs from canonical metadata');
  });

  it('requires dormant guidance to be absent', () => {
    expect(() => requireGuidanceListParity([guidance], [guidance], new Set())).toThrow(
      'Dormant guidance appears in resources/list',
    );
  });
});

import { describe, expect, it } from 'vitest';
import { requireGuidanceReadResultParity } from './guidance-read-parity.js';

const expected = {
  contents: [
    {
      uri: 'docs://oak/guidance/example.md',
      mimeType: 'text/markdown',
      text: '# Example',
      _meta: { lastModified: '2026-07-23T00:00:00Z' },
    },
  ],
} as const;

describe('requireGuidanceReadResultParity', () => {
  it('accepts one exact URI, MIME type, text, and metadata envelope', () => {
    expect(() => requireGuidanceReadResultParity(expected, expected)).not.toThrow();
  });

  it('rejects additional model-facing content entries', () => {
    expect(() =>
      requireGuidanceReadResultParity(expected, {
        contents: [expected.contents[0], { ...expected.contents[0], text: 'extra content' }],
      }),
    ).toThrow('Guidance read returned 2 content entries');
  });

  it.each([
    {
      field: 'uri',
      content: { ...expected.contents[0], uri: 'docs://oak/guidance/other.md' },
    },
    { field: 'MIME type', content: { ...expected.contents[0], mimeType: 'text/plain' } },
    { field: 'text', content: { ...expected.contents[0], text: '# Changed' } },
    {
      field: 'last modified',
      content: {
        ...expected.contents[0],
        _meta: { lastModified: '2026-07-24T00:00:00Z' },
      },
    },
    {
      field: 'missing metadata',
      content: {
        uri: expected.contents[0].uri,
        mimeType: expected.contents[0].mimeType,
        text: expected.contents[0].text,
      },
    },
    {
      field: 'extra field',
      content: { ...expected.contents[0], unexpected: true },
    },
  ])('rejects a mismatched $field', ({ content }) => {
    expect(() => requireGuidanceReadResultParity(expected, { contents: [content] })).toThrow(
      'Served guidance envelope differs from canonical source',
    );
  });
});

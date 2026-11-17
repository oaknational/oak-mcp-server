import { afterEach, describe, expect, it, vi } from 'vitest';
import { isErr, isOk } from '@oaknational/result';

import { fetchText } from './sitemap-fetch.js';

const SITEMAP_URL = 'https://www.thenational.academy/sitemap.xml';

function xmlResponse(text: () => Promise<string>): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    url: SITEMAP_URL,
    headers: new Headers({ 'content-type': 'application/xml' }),
    text,
  } as unknown as Response;
}

describe('fetchText', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('returns an error result when reading the response body fails', async () => {
    const failure = new Error('connection reset');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(xmlResponse(() => Promise.reject(failure))));

    const result = await fetchText(SITEMAP_URL, 1);

    expect(isErr(result) && result.error).toBe(failure);
  });

  it('retries after a body read failure and returns the later success', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(xmlResponse(() => Promise.reject(new Error('connection reset'))))
      .mockResolvedValueOnce(xmlResponse(() => Promise.resolve('<urlset></urlset>')));
    vi.stubGlobal('fetch', fetchMock);

    const pending = fetchText(SITEMAP_URL, 2);
    await vi.runAllTimersAsync();
    const result = await pending;

    expect(isOk(result) && result.value).toBe('<urlset></urlset>');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

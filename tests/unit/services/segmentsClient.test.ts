import { describe, expect, it, vi } from 'vitest';
import { SegmentApiError, segmentsClient } from '@/services/segments-api/segmentsClient';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });

function stubFetch(response: Response | Error) {
  const fetchMock = vi.fn(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const errorOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return error as SegmentApiError;
  }
  throw new Error('Expected a rejection');
};

describe('BR-28 / AC-29: segmentsClient talks only to the local API', () => {
  it('requests same-origin paths under /api/segments', async () => {
    const fetchMock = vi.fn(async () => json({ segments: [], segment: {} }));
    vi.stubGlobal('fetch', fetchMock);
    await segmentsClient.list();
    await segmentsClient.get('12');
    await segmentsClient.remove('12').catch(() => undefined);
    for (const call of fetchMock.mock.calls as unknown as [string, RequestInit][]) {
      expect(call[0]).toMatch(/^\/api\/segments(\/|$)/);
      expect(call[1].credentials).toBe('same-origin');
    }
  });
});

describe('segmentsClient', () => {
  it('returns the response data', async () => {
    stubFetch(json({ segments: [{ segmentId: '1' }] }));
    expect(await segmentsClient.list()).toEqual([{ segmentId: '1' }]);
  });

  it('posts a payload as JSON', async () => {
    const fetchMock = stubFetch(json({ plan: { items: [] } }));
    const payload = { sourceFile: 'a.json', segments: [], efforts: [] };
    expect(await segmentsClient.preview(payload)).toEqual({ items: [] });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/segments/preview');
    expect(init).toMatchObject({ method: 'POST', body: JSON.stringify(payload) });
    expect(init.headers).toMatchObject({ 'Content-Type': 'application/json' });
  });

  it('accepts an empty 204 response', async () => {
    stubFetch(new Response(null, { status: 204 }));
    await expect(segmentsClient.removeAll()).resolves.toBeUndefined();
  });

  it('turns an API error into its code and problems', async () => {
    const problems = [{ location: 'segment 1', field: 'name', message: 'Is required.' }];
    stubFetch(json({ error: { code: 'invalid-payload', problems } }, 400));
    const error = await errorOf(
      segmentsClient.import({ sourceFile: 'a', segments: [], efforts: [] }),
    );
    expect(error).toBeInstanceOf(SegmentApiError);
    expect(error.code).toBe('invalid-payload');
    expect(error.problems).toEqual(problems);
  });

  it('maps unknown codes to storage-error', async () => {
    stubFetch(json({ error: { code: 'weird' } }, 500));
    expect((await errorOf(segmentsClient.list())).code).toBe('storage-error');
  });

  it('reports storage as unavailable when the backend is missing or unreachable', async () => {
    stubFetch(new TypeError('Failed to fetch'));
    expect((await errorOf(segmentsClient.list())).code).toBe('storage-unavailable');

    // A static file server answers with HTML instead of the API.
    stubFetch(
      new Response('<!doctype html>', { status: 200, headers: { 'Content-Type': 'text/html' } }),
    );
    expect((await errorOf(segmentsClient.list())).code).toBe('storage-unavailable');

    stubFetch(
      new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain' } }),
    );
    expect((await errorOf(segmentsClient.list())).code).toBe('storage-unavailable');
  });

  it('encodes segment IDs in paths', async () => {
    const fetchMock = stubFetch(json({ segment: {} }));
    await segmentsClient.get('1/2');
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe('/api/segments/1%2F2');
  });
});

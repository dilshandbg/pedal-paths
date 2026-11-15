// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { parseSegmentFile } from '../../../src/features/segments/services/parseSegmentFile';
import {
  fetchStravaSegments,
  type HttpGet,
  parseFetchArguments,
  segmentIdsFromFile,
  STRAVA_API,
  toImportFile,
} from '../../../server/strava/fetchSegments';

/* MOCKED Strava API responses with SYNTHETIC values. No real account, token or network. */
const TOKEN = 'test-token-not-real';

const detail = (id: number, name: string) => ({
  id,
  name,
  distance: 3680.4,
  average_grade: 1.2,
  maximum_grade: 8.5,
  elevation_high: 482.7,
  elevation_low: 439.6,
  total_elevation_gain: 52.3,
  start_latlng: [7.29, 80.63],
  end_latlng: [7.31, 80.65],
  map: { polyline: '_p~iF~ps|U_ulLnnqC' },
});
const streams = {
  latlng: {
    data: [
      [7.29, 80.63],
      [7.3, 80.64],
      [7.31, 80.65],
    ],
    series_type: 'distance',
  },
  altitude: { data: [439.6, 470.1, 482.7], series_type: 'distance' },
  distance: { data: [0, 1800.2, 3680.4], series_type: 'distance' },
  // Streams that were not asked for are dropped.
  time: { data: [0, 1, 2] },
};

const json = (status: number, body: unknown = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  json: () => Promise.resolve(body),
});

/** A fake Strava: answers by URL, and records each request. */
function fakeStrava(routes: Record<string, ReturnType<typeof json> | Error>) {
  const requests: { url: string; headers: Readonly<Record<string, string>> }[] = [];
  const get: HttpGet = (url, init) => {
    requests.push({ url, headers: init.headers });
    const answer = routes[url.replace(STRAVA_API, '').replace(/\?.*$/, '')] ?? json(404);
    return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
  };
  return { get, requests };
}

describe('BR-31: fetchStravaSegments', () => {
  it('downloads details and route streams, with the token only in the Authorization header', async () => {
    const strava = fakeStrava({
      '/segments/27580806': json(200, detail(27580806, 'Hantana Climb')),
      '/segments/27580806/streams': json(200, streams),
    });
    const result = await fetchStravaSegments(['27580806'], TOKEN, strava.get);

    expect(result.failures).toEqual([]);
    expect(result.stopped).toBeNull();
    expect(result.segments).toEqual([
      {
        ...detail(27580806, 'Hantana Climb'),
        streams: {
          latlng: { data: streams.latlng.data },
          altitude: { data: streams.altitude.data },
          distance: { data: streams.distance.data },
        },
      },
    ]);
    expect(strava.requests.map((r) => r.url)).toEqual([
      `${STRAVA_API}/segments/27580806`,
      `${STRAVA_API}/segments/27580806/streams?keys=latlng,altitude,distance&key_by_type=true`,
    ]);
    for (const request of strava.requests) {
      expect(request.url).not.toContain(TOKEN);
      expect(request.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    }
  });

  it('writes a file the existing upload reads with the real name and the full route', async () => {
    const strava = fakeStrava({
      '/segments/27580806': json(200, detail(27580806, 'Hantana Climb')),
      '/segments/27580806/streams': json(200, streams),
    });
    const file = toImportFile(await fetchStravaSegments(['27580806'], TOKEN, strava.get));
    const parsed = parseSegmentFile('strava-segments.json', file);
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.problems));
    expect(parsed.payload.segments[0]).toMatchObject({
      segmentId: '27580806',
      name: 'Hantana Climb',
      distanceM: 3680.4,
      route: [
        { latitude: 7.29, longitude: 80.63 },
        { latitude: 7.3, longitude: 80.64 },
        { latitude: 7.31, longitude: 80.65 },
      ],
      altitudeSamplesM: [439.6, 470.1, 482.7],
      distanceSamplesM: [0, 1800.2, 3680.4],
    });
  });

  it('skips a segment that is missing and keeps one whose streams fail', async () => {
    const strava = fakeStrava({
      '/segments/1': json(200, detail(1, 'One')),
      '/segments/1/streams': json(500),
      '/segments/3': json(200, detail(3, 'Three')),
      '/segments/3/streams': new Error('offline'),
    });
    const result = await fetchStravaSegments(['1', '2', '3'], TOKEN, strava.get);
    expect(result.segments.map((s) => [s.id, 'streams' in s])).toEqual([
      [1, false],
      [3, false],
    ]);
    expect(result.failures).toEqual([
      { segmentId: '1', reason: 'route streams unavailable: Strava answered 500' },
      { segmentId: '2', reason: 'not found on Strava, or not visible to you (404)' },
      {
        segmentId: '3',
        reason: 'route streams unavailable: Strava could not be reached (network error)',
      },
    ]);
  });

  it.each([
    [401, /rejected the access token/],
    [429, /rate limit/],
  ])('stops at %i, keeping what was downloaded', async (status, message) => {
    const strava = fakeStrava({
      '/segments/1': json(200, detail(1, 'One')),
      '/segments/1/streams': json(200, streams),
      '/segments/2': json(status),
    });
    const result = await fetchStravaSegments(['1', '2', '3'], TOKEN, strava.get);
    expect(result.segments.map((s) => s.id)).toEqual([1]);
    expect(result.stopped).toMatch(message);
    expect(strava.requests.some((r) => r.url.includes('/segments/3'))).toBe(false);
  });

  it('rejects details that are not the requested segment', async () => {
    const strava = fakeStrava({ '/segments/5': json(200, detail(6, 'Other')) });
    const result = await fetchStravaSegments(['5'], TOKEN, strava.get);
    expect(result.segments).toEqual([]);
    expect(result.failures[0]?.reason).toMatch(/unexpected form/);
  });
});

describe('BR-31: fetch command input', () => {
  it('reads segment IDs from a catalog or an upload file, once each', () => {
    expect(
      segmentIdsFromFile({
        version: 1,
        segments: [{ id: '27580806' }, { id: 35710081 }, { id: '27580806' }, { id: 'x' }],
      }),
    ).toEqual(['27580806', '35710081']);
    expect(segmentIdsFromFile([{ segmentId: '7' }])).toEqual(['7']);
    expect(segmentIdsFromFile({ nothing: true })).toEqual([]);
  });

  it('parses IDs and options, and reports bad input', () => {
    expect(parseFetchArguments(['1', '2', '1', '--out', 'x.json'])).toEqual({
      segmentIds: ['1', '2'],
      from: null,
      out: 'x.json',
      errors: [],
    });
    expect(parseFetchArguments(['--from', 'catalog.json'])).toMatchObject({
      from: 'catalog.json',
    });
    expect(parseFetchArguments(['abc', '--out']).errors).toEqual([
      '"abc" is not a Strava segment ID.',
      '--out needs a file path.',
    ]);
  });
});

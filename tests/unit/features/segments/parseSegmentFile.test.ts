import { describe, expect, it } from 'vitest';
import { parseSegmentFile } from '@/features/segments/services/parseSegmentFile';

/* SYNTHETIC segment files. Not real Strava data. */

const POLYLINE = '_p~iF~ps|U_ulLnnqC_mqNvxq`@';

const stravaSegment = {
  id: 229781,
  name: 'Synthetic Hill',
  distance: 2684.82,
  total_elevation_gain: 155.7,
  average_grade: 5.7,
  maximum_grade: 14.2,
  elevation_high: 245.3,
  elevation_low: 92.4,
  city: 'Testville',
  state: 'TS',
  country: 'Nowhere',
  start_latlng: [37.8331, -122.4834],
  end_latlng: [37.8281, -122.4981],
  map: { polyline: POLYLINE },
  athlete_segment_stats: { pr_elapsed_time: 553, pr_date: '1993-04-03', effort_count: 2 },
  efforts: [
    {
      id: 1234556789,
      activity_id: 3454504,
      start_date: '2024-06-01T07:12:00Z',
      elapsed_time: 560,
      moving_time: 558,
    },
    { start_date: '2023-05-14T06:40:10Z', elapsed_time: 553 },
  ],
};

const parse = (fileName: string, content: unknown, known?: ReadonlySet<string>) =>
  parseSegmentFile(
    fileName,
    typeof content === 'string' ? content : JSON.stringify(content),
    known,
  );

const problemsOf = (result: ReturnType<typeof parse>) => (result.ok ? [] : result.problems);

describe('BR-20 / AC-20: parseSegmentFile reads JSON', () => {
  it('maps a Strava segment object with its efforts', () => {
    const result = parse('segments.json', { segments: [stravaSegment] });
    if (!result.ok) throw new Error(JSON.stringify(result.problems));

    expect(result.payload.sourceFile).toBe('segments.json');
    expect(result.payload.segments).toEqual([
      {
        segmentId: '229781',
        name: 'Synthetic Hill',
        distanceM: 2684.82,
        elevationGainM: 155.7,
        averageGradePct: 5.7,
        maximumGradePct: 14.2,
        elevationHighM: 245.3,
        elevationLowM: 92.4,
        city: 'Testville',
        state: 'TS',
        country: 'Nowhere',
        start: { latitude: 37.8331, longitude: -122.4834 },
        end: { latitude: 37.8281, longitude: -122.4981 },
        route: [
          { latitude: 38.5, longitude: -120.2 },
          { latitude: 40.7, longitude: -120.95 },
          { latitude: 43.252, longitude: -126.453 },
        ],
        altitudeSamplesM: null,
        distanceSamplesM: null,
        prElapsedTimeS: 553,
        prDate: '1993-04-03',
        effortCount: 2,
      },
    ]);
    expect(result.payload.efforts).toEqual([
      {
        segmentId: '229781',
        effortId: '1234556789',
        activityId: '3454504',
        startDate: '2024-06-01T07:12:00.000Z',
        elapsedTimeS: 560,
        movingTimeS: 558,
      },
      {
        segmentId: '229781',
        effortId: null,
        activityId: null,
        startDate: '2023-05-14T06:40:10.000Z',
        elapsedTimeS: 553,
        movingTimeS: null,
      },
    ]);
  });

  it('accepts a bare array, minimal segments and unknown fields', () => {
    const result = parse('list.json', [{ id: '7', name: 'Bare', extra: true, start_latlng: [] }]);
    expect(result.ok && result.payload.segments[0]).toMatchObject({
      segmentId: '7',
      name: 'Bare',
      distanceM: null,
      start: null,
      route: null,
    });
  });

  it('prefers a GeoJSON geometry over the encoded polyline', () => {
    const result = parse('g.json', [
      {
        ...stravaSegment,
        efforts: [],
        geometry: {
          type: 'LineString',
          coordinates: [
            [1, 2],
            [3, 4],
          ],
        },
      },
    ]);
    expect(result.ok && result.payload.segments[0]?.route).toEqual([
      { latitude: 2, longitude: 1 },
      { latitude: 4, longitude: 3 },
    ]);
  });

  it('takes the date part of an ISO personal best date', () => {
    const result = parse('d.json', [
      { id: 1, name: 'A', athlete_segment_stats: { pr_date: '2020-02-03T10:00:00Z' } },
    ]);
    expect(result.ok && result.payload.segments[0]?.prDate).toBe('2020-02-03');
  });
});

describe('BR-20 / AC-20: parseSegmentFile reads GeoJSON', () => {
  const feature = (patch: Record<string, unknown> = {}) => ({
    type: 'Feature',
    id: 42,
    geometry: {
      type: 'LineString',
      coordinates: [
        [-122.48, 37.83],
        [-122.49, 37.82],
      ],
    },
    properties: { name: 'Feature Hill', distance: 1200 },
    ...patch,
  });

  it('uses the feature id, properties and geometry', () => {
    const result = parse('s.geojson', { type: 'FeatureCollection', features: [feature()] });
    expect(result.ok && result.payload.segments[0]).toMatchObject({
      segmentId: '42',
      name: 'Feature Hill',
      distanceM: 1200,
      route: [
        { latitude: 37.83, longitude: -122.48 },
        { latitude: 37.82, longitude: -122.49 },
      ],
    });
  });

  it('joins MultiLineString parts in order', () => {
    const result = parse('s.geojson', {
      type: 'FeatureCollection',
      features: [
        feature({
          geometry: {
            type: 'MultiLineString',
            coordinates: [
              [
                [0, 0],
                [1, 1],
              ],
              [
                [2, 2],
                [3, 3],
              ],
            ],
          },
        }),
      ],
    });
    expect(result.ok && result.payload.segments[0]?.route?.map((p) => p.longitude)).toEqual([
      0, 1, 2, 3,
    ]);
  });

  it('reports an unsupported geometry against the feature', () => {
    const result = parse('s.geojson', {
      type: 'FeatureCollection',
      features: [feature({ geometry: { type: 'Point', coordinates: [0, 0] } })],
    });
    expect(problemsOf(result)).toEqual([
      expect.objectContaining({
        location: 'feature 1 (ID 42)',
        field: 'streams.latlng / route.latlng / geometry / map.polyline',
      }),
    ]);
  });

  it('rejects a collection without features', () => {
    expect(problemsOf(parse('s.geojson', { type: 'FeatureCollection' }))[0]?.message).toMatch(
      /features/,
    );
  });
});

describe('BR-29: parseSegmentFile reads altitude and distance samples', () => {
  const streamsKeyed = {
    latlng: {
      data: [
        [1, 2],
        [1.001, 2.001],
        [1.002, 2.002],
      ],
    },
    altitude: { data: [100, 104.5, 110] },
    distance: { data: [0, 140.2, 280.4] },
  };

  it('reads Strava streams keyed by type, using the latlng stream as the route', () => {
    const result = parse('s.json', [{ ...stravaSegment, streams: streamsKeyed }]);
    if (!result.ok) throw new Error(JSON.stringify(result.problems));
    expect(result.payload.segments[0]).toMatchObject({
      route: [
        { latitude: 1, longitude: 2 },
        { latitude: 1.001, longitude: 2.001 },
        { latitude: 1.002, longitude: 2.002 },
      ],
      altitudeSamplesM: [100, 104.5, 110],
      distanceSamplesM: [0, 140.2, 280.4],
    });
  });

  it('reads streams given as a list of typed streams', () => {
    const streams = Object.entries(streamsKeyed).map(([type, { data }]) => ({ type, data }));
    const result = parse('s.json', [{ ...stravaSegment, streams }]);
    expect(result.ok && result.payload.segments[0]?.altitudeSamplesM).toEqual([100, 104.5, 110]);
  });

  it('takes altitude from the third GeoJSON coordinate, only when every position has one', () => {
    const line = (coordinates: number[][]) => ({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          id: 5,
          properties: { name: 'G' },
          geometry: { type: 'LineString', coordinates },
        },
      ],
    });
    const withZ = parse(
      'g.geojson',
      line([
        [2, 1, 50],
        [2.1, 1.1, 55],
      ]),
    );
    expect(withZ.ok && withZ.payload.segments[0]?.altitudeSamplesM).toEqual([50, 55]);
    const partial = parse(
      'g.geojson',
      line([
        [2, 1, 50],
        [2.1, 1.1],
      ]),
    );
    expect(partial.ok && partial.payload.segments[0]?.altitudeSamplesM).toBeNull();
  });

  it('rejects samples that do not match the route, naming the stream', () => {
    const result = parse('s.json', [
      { ...stravaSegment, efforts: [], streams: { ...streamsKeyed, altitude: { data: [1, 2] } } },
    ]);
    expect(problemsOf(result)).toEqual([
      {
        location: 'segment 1 (ID 229781)',
        field: 'streams.altitude / route.altitude / geometry altitude',
        message: 'Must have one value per route point (3), not 2.',
      },
    ]);
  });

  it('rejects an invalid latlng stream', () => {
    const result = parse('s.json', [
      { ...stravaSegment, streams: { latlng: { data: [[1, 2], []] } } },
    ]);
    expect(problemsOf(result)[0]).toMatchObject({
      field: 'streams.latlng / route.latlng / geometry / map.polyline',
    });
  });
});

describe('BR-20 / AC-20: parseSegmentFile reads the segment catalog format', () => {
  /** Shaped like docs/segment-catalog-format.md; synthetic values. */
  const catalogSegment = (patch: Record<string, unknown> = {}) => ({
    id: '35710081',
    name: 'Synthetic Climb',
    distanceKm: 0.685,
    elevationMinM: 508.8,
    elevationMaxM: 527.8,
    start: { lat: 7.29, lng: 80.63 },
    end: { lat: 7.3, lng: 80.64 },
    route: { latlng: [], altitude: [], distance: [] },
    ...patch,
  });
  const catalogFile = (...segments: unknown[]) => ({ version: 1, segments });

  it('keeps the name and maps distance, elevation range and start/end, without a route', () => {
    const result = parse('strava_segments_catalog.json', catalogFile(catalogSegment()));
    if (!result.ok) throw new Error(JSON.stringify(result.problems));
    expect(result.payload.segments).toEqual([
      {
        segmentId: '35710081',
        name: 'Synthetic Climb',
        distanceM: 685,
        elevationGainM: null,
        averageGradePct: null,
        maximumGradePct: null,
        elevationHighM: 527.8,
        elevationLowM: 508.8,
        city: null,
        state: null,
        country: null,
        start: { latitude: 7.29, longitude: 80.63 },
        end: { latitude: 7.3, longitude: 80.64 },
        route: null, // empty route lists mean "not known"
        altitudeSamplesM: null,
        distanceSamplesM: null,
        prElapsedTimeS: null,
        prDate: null,
        effortCount: null,
      },
    ]);
  });

  it('reads route.latlng with its altitude and distance samples', () => {
    const route = {
      latlng: [
        [7.29, 80.63],
        [7.3, 80.64],
      ],
      altitude: [508.8, 527.8],
      distance: [0, 685],
    };
    const result = parse('c.json', catalogFile(catalogSegment({ route })));
    expect(result.ok && result.payload.segments[0]).toMatchObject({
      route: [
        { latitude: 7.29, longitude: 80.63 },
        { latitude: 7.3, longitude: 80.64 },
      ],
      altitudeSamplesM: [508.8, 527.8],
      distanceSamplesM: [0, 685],
    });
  });

  it('reads the additional catalog fields and efforts', () => {
    const result = parse(
      'c.json',
      catalogFile(
        catalogSegment({
          elevationGainM: 19,
          prElapsedTimeS: 120,
          prDate: '2024-05-01',
          efforts: [{ effortId: '77', startDate: '2024-05-01T07:00:00.000Z', elapsedTimeS: 120 }],
        }),
      ),
    );
    if (!result.ok) throw new Error(JSON.stringify(result.problems));
    expect(result.payload.segments[0]).toMatchObject({
      elevationGainM: 19,
      prElapsedTimeS: 120,
      prDate: '2024-05-01',
    });
    expect(result.payload.efforts).toEqual([
      {
        segmentId: '35710081',
        effortId: '77',
        activityId: null,
        startDate: '2024-05-01T07:00:00.000Z',
        elapsedTimeS: 120,
        movingTimeS: null,
      },
    ]);
  });

  it('prefers Strava field names when both are given', () => {
    const result = parse('c.json', [catalogSegment({ distance: 700, start_latlng: [1, 2] })]);
    expect(result.ok && result.payload.segments[0]).toMatchObject({
      distanceM: 700,
      start: { latitude: 1, longitude: 2 },
    });
  });

  it('reports invalid catalog values under their own names', () => {
    const result = parse(
      'c.json',
      catalogFile(catalogSegment({ distanceKm: 'far', start: { lat: 'x', lng: 1 } })),
    );
    expect(problemsOf(result).map((p) => p.field)).toEqual([
      'distance / distanceKm',
      'start_latlng / start',
    ]);
  });
});

describe('BR-20 / AC-20: parseSegmentFile reads CSV', () => {
  it('reads a segments CSV, leaving empty cells unknown', () => {
    const csv = [
      'segment_id,name,distance_m,elevation_gain_m,start_lat,start_lng,polyline,pr_elapsed_time_s,pr_date',
      `229781,"Hill, Synthetic",2684.8,155.7,37.8331,-122.4834,${POLYLINE},553,1993-04-03`,
      '',
      '7,Flat,,,,,,,',
    ].join('\r\n');
    const result = parse('segments.csv', csv);
    if (!result.ok) throw new Error(JSON.stringify(result.problems));

    expect(result.payload.segments).toHaveLength(2);
    expect(result.payload.segments[0]).toMatchObject({
      segmentId: '229781',
      name: 'Hill, Synthetic',
      distanceM: 2684.8,
      start: { latitude: 37.8331, longitude: -122.4834 },
      prElapsedTimeS: 553,
    });
    expect(result.payload.segments[0]?.route).toHaveLength(3);
    expect(result.payload.segments[1]).toMatchObject({
      segmentId: '7',
      distanceM: null,
      start: null,
      route: null,
    });
  });

  it('reads an efforts CSV for stored segments', () => {
    const csv =
      'segment_id,start_date,elapsed_time_s,moving_time_s,effort_id,activity_id\n' +
      '229781,2024-06-01T07:12:00Z,560,558,1234556789,3454504\n';
    const result = parse('efforts.csv', csv, new Set(['229781']));
    if (!result.ok) throw new Error(JSON.stringify(result.problems));
    expect(result.payload.segments).toEqual([]);
    expect(result.payload.efforts).toEqual([
      {
        segmentId: '229781',
        effortId: '1234556789',
        activityId: '3454504',
        startDate: '2024-06-01T07:12:00.000Z',
        elapsedTimeS: 560,
        movingTimeS: 558,
      },
    ]);
  });

  it('rejects efforts for a segment that is not stored, naming the row', () => {
    const csv = 'segment_id,start_date,elapsed_time_s\n99,2024-06-01T07:12:00Z,560\n';
    expect(problemsOf(parse('efforts.csv', csv))).toEqual([
      {
        location: 'row 2',
        field: 'segment_id',
        message: 'Segment 99 is not in this import or stored.',
      },
    ]);
  });

  it('rejects an unrecognised header', () => {
    expect(problemsOf(parse('x.csv', 'a,b\n1,2\n'))[0]?.message).toMatch(/Unrecognised CSV header/);
  });
});

describe('BR-21 / AC-21: parseSegmentFile reports problems by record and field', () => {
  it('rejects unsupported, empty and malformed files', () => {
    expect(problemsOf(parse('s.txt', '[]'))[0]?.message).toMatch(/Unsupported file type/);
    expect(problemsOf(parse('s.json', '  '))[0]?.message).toBe('The file is empty.');
    expect(problemsOf(parse('s.json', '{"segments": ['))[0]?.message).toBe(
      'The file is not valid JSON.',
    );
    expect(problemsOf(parse('s.json', { other: [] }))[0]?.message).toMatch(/list of segments/);
  });

  it('uses the file’s own field names and locations', () => {
    const result = parse('s.json', [
      {
        id: 1,
        name: 'A',
        distance: 'far',
        efforts: [{ start_date: 'yesterday', elapsed_time: 5 }],
      },
      { id: 2, name: '', map: { polyline: '_p~iF' } },
    ]);
    // Segments are reported first, then efforts.
    expect(problemsOf(result)).toEqual([
      { location: 'segment 1 (ID 1)', field: 'distance / distanceKm', message: expect.any(String) },
      { location: 'segment 2 (ID 2)', field: 'name', message: expect.any(String) },
      {
        location: 'segment 2 (ID 2)',
        field: 'streams.latlng / route.latlng / geometry / map.polyline',
        message: expect.any(String),
      },
      { location: 'segment 1 (ID 1), effort 1', field: 'start_date', message: expect.any(String) },
    ]);
  });

  it('names the CSV row of an invalid record', () => {
    const csv = 'segment_id,name,average_grade\n1,A,5\n2,B,250\n';
    expect(problemsOf(parse('s.csv', csv))).toEqual([
      { location: 'row 3', field: 'average_grade', message: expect.any(String) },
    ]);
  });

  it('AC-24: reports a segment ID that appears twice in one file', () => {
    const problems = problemsOf(
      parse('s.json', [
        { id: 5, name: 'A' },
        { id: 5, name: 'B' },
      ]),
    );
    expect(problems).toEqual([
      { location: 'segment 2 (ID 5)', field: 'id', message: 'Appears more than once.' },
    ]);
  });
});

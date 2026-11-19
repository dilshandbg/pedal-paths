import { describe, expect, it } from 'vitest';
import {
  isCalendarDate,
  parseComparisonQuery,
  parseLocationQuery,
  parseRangeQuery,
  parseRouteFrequencyQuery,
} from '@/features/analytics/services/parseAnalyticsQuery';

const q = (query: string) => new URLSearchParams(query);
const problems = (parsed: { ok: boolean; problems?: readonly string[] }) =>
  parsed.ok ? [] : (parsed.problems ?? []);

describe('NFR-08: analytics query parameters', () => {
  it('accepts only real calendar dates', () => {
    expect(isCalendarDate('2024-02-29')).toBe(true);
    expect(isCalendarDate('2023-02-29')).toBe(false);
    expect(isCalendarDate('2024-13-01')).toBe(false);
    expect(isCalendarDate('24-01-01')).toBe(false);
  });

  it('reads an optional date range and rejects one that ends before it starts', () => {
    expect(parseRangeQuery(q(''))).toEqual({ ok: true, value: { from: null, to: null } });
    expect(parseRangeQuery(q('from=2024-01-01&to=2024-12-31'))).toEqual({
      ok: true,
      value: { from: '2024-01-01', to: '2024-12-31' },
    });
    expect(problems(parseRangeQuery(q('from=2024-02-01&to=2024-01-01')))).toEqual([
      'from must not be after to.',
    ]);
    expect(problems(parseRangeQuery(q('from=yesterday')))).toEqual([
      'from must be a date as YYYY-MM-DD.',
    ]);
  });

  it('RULE-24: reads a place, with a default radius of 100 m', () => {
    expect(parseLocationQuery(q('lat=51.5&lng=-0.12'))).toEqual({
      ok: true,
      value: { latitude: 51.5, longitude: -0.12, radiusM: 100, range: { from: null, to: null } },
    });
    expect(problems(parseLocationQuery(q('lng=-0.12&radiusM=0')))).toEqual([
      'lat is required.',
      'radiusM must be 1–5000 metres.',
    ]);
    expect(problems(parseLocationQuery(q('lat=91&lng=181')))).toHaveLength(2);
  });

  it('reads an area for road frequency, within limits', () => {
    expect(parseRouteFrequencyQuery(q('south=51&west=-0.5&north=51.5&east=0'))).toEqual({
      ok: true,
      value: {
        bounds: { south: 51, west: -0.5, north: 51.5, east: 0 },
        limit: 20,
        range: { from: null, to: null },
      },
    });
    expect(problems(parseRouteFrequencyQuery(q('south=51&west=-2&north=51.5&east=0')))).toEqual([
      'The area may be at most 1° on each side.',
    ]);
    expect(
      problems(parseRouteFrequencyQuery(q('south=52&west=0&north=51&east=1&limit=0'))),
    ).toEqual(['limit must be a whole number 1–500.']);
    expect(problems(parseRouteFrequencyQuery(q('south=52&west=0&north=51&east=1')))).toEqual([
      'south must not be north of north.',
    ]);
  });

  it('reads a comparison of two complete periods', () => {
    const periods = 'aFrom=2023-01-01&aTo=2023-12-31&bFrom=2024-01-01&bTo=2024-12-31';

    expect(parseComparisonQuery(q(`metric=distanceKm&${periods}`))).toEqual({
      ok: true,
      value: {
        metric: 'distanceKm',
        periodA: { from: '2023-01-01', to: '2023-12-31' },
        periodB: { from: '2024-01-01', to: '2024-12-31' },
        location: null,
      },
    });
    expect(problems(parseComparisonQuery(q('metric=speed&aFrom=2023-01-01&bTo=')))).toEqual([
      'metric must be one of: distanceKm, rideCount, elevationGainM, movingTimeS, locationVisits.',
      'aTo is required.',
      'bFrom is required.',
      'bTo is required.',
    ]);
    expect(problems(parseComparisonQuery(q(`metric=locationVisits&${periods}`)))).toEqual([
      'lat is required.',
      'lng is required.',
    ]);
  });
});

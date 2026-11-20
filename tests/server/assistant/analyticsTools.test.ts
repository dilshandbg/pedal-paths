// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { GPSPoint } from '../../../src/types/activity';
import type { MonthTotals } from '../../../src/types/analytics';
import { createRideAnalytics, type RideAnalytics } from '../../../server/analytics/rideAnalytics';
import { openRideRepository, type RideRepository } from '../../../server/rides/rideRepository';
import {
  createAnalyticsTools,
  MAX_NAMED_VISITS,
  MAX_TOOL_RESULT_BYTES,
  type AssistantTool,
} from '../../../server/assistant/tools/analyticsTools';
import { ride, upload } from '../rideFixtures';

/* SYNTHETIC ride history in a real in-memory ride database (as tests/server/analytics). */

const point = (latitude: number, longitude: number): GPSPoint => ({
  latitude: Math.round(latitude * 1e7) / 1e7,
  longitude: Math.round(longitude * 1e7) / 1e7,
  elevation: null,
  timestamp: null,
});
const road = (latitude: number): GPSPoint[] =>
  Array.from({ length: 151 }, (_, i) => point(latitude, -0.135 + (0.03 * i) / 150));
const NEAR = road(51.5 + 40 / 111_195);

let repository: RideRepository;
let analytics: RideAnalytics;
let tools: readonly AssistantTool[];
const tool = (name: string) => {
  const found = tools.find((t) => t.definition.name === name);
  if (!found) throw new Error(`no tool ${name}`);
  return found;
};
const run = (name: string, args: unknown) => {
  const result = tool(name).run(args);
  return { ...result, json: JSON.parse(result.content) as Record<string, unknown> };
};

beforeEach(() => {
  repository = openRideRepository(':memory:');
  repository.importUpload(
    upload(1, [
      ride(
        '1',
        { activityDate: '2023-06-01T08:00:00.000Z', distanceKm: 20.04, movingTimeS: 5400 },
        NEAR,
      ),
      ride(
        '2',
        { activityDate: '2023-06-15T08:00:00.000Z', distanceKm: 30, movingTimeS: 3600 },
        NEAR,
      ),
      ride('3', { activityDate: '2024-06-01T08:00:00.000Z', distanceKm: 40 }, road(51.51)),
    ]),
  );
  analytics = createRideAnalytics(repository, 'UTC');
  tools = createAnalyticsTools(analytics, { timeZone: 'UTC' });
});
afterEach(() => repository.close());

describe('BR-39: the analytics are offered as tools', () => {
  it('offers the five v2.4 analytics, and no segment matching (deferred)', () => {
    expect(tools.map((t) => t.definition.name)).toEqual([
      'distance_by_month',
      'distance_by_year',
      'location_visits',
      'route_frequency',
      'compare_periods',
    ]);
  });

  it('describes each with a closed JSON Schema', () => {
    for (const t of tools) {
      expect(t.definition.parameters).toMatchObject({
        type: 'object',
        additionalProperties: false,
      });
      for (const required of t.definition.parameters.required) {
        expect(t.definition.parameters.properties).toHaveProperty(required);
      }
    }
    expect(tool('location_visits').definition.parameters.required).toEqual(['lat', 'lng']);
  });
});

describe('AC-43: tool results are the analytics results', () => {
  it('distance by month equals RideAnalytics, rounded for reading', () => {
    const result = run('distance_by_month', { from: '2023-01-01', to: '2023-12-31' });
    const expected = analytics.distanceByMonth({ from: '2023-01-01', to: '2023-12-31' });
    expect(result.ok).toBe(true);
    expect(result.json.months).toEqual(
      expected.map((m) => ({
        year: m.year,
        month: m.month,
        rides: m.rideCount,
        distanceKm: Math.round(m.distanceKm * 10) / 10,
        elevationGainM: Math.round(m.elevationGainM),
        movingTimeH: Math.round((m.movingTimeS / 3600) * 10) / 10,
      })),
    );
    expect(result.json.months).toEqual([
      { year: 2023, month: 6, rides: 2, distanceKm: 50, elevationGainM: 100, movingTimeH: 2.5 },
    ]);
  });

  it('distance by year with no range covers every year', () => {
    const years = run('distance_by_year', {}).json.years as { year: number; rides: number }[];
    expect(years.map((y) => [y.year, y.rides])).toEqual([
      [2023, 2],
      [2024, 1],
    ]);
  });

  it('location visits count the rides near the place', () => {
    const result = run('location_visits', { lat: 51.5, lng: -0.12, radiusM: 100 });
    expect(result.json).toMatchObject({
      visitCount: 2,
      firstVisit: '2023-06-01',
      lastVisit: '2023-06-15',
      radiusM: 100,
    });
  });

  it('compares two periods', () => {
    const result = run('compare_periods', {
      metric: 'distanceKm',
      aFrom: '2023-01-01',
      aTo: '2023-12-31',
      bFrom: '2024-01-01',
      bTo: '2024-12-31',
    });
    // 2023: 20.04 + 30 = 50.04 km; 2024: 40 km. Shown to 0.1 km and 0.1 %.
    expect(result.json).toMatchObject({
      metric: 'distanceKm',
      periodA: { value: 50 },
      periodB: { value: 40 },
      difference: -10,
      percentChange: -20.1,
    });
  });

  it('gives moving time comparisons in hours', () => {
    const result = run('compare_periods', {
      metric: 'movingTimeS',
      aFrom: '2023-06-01',
      aTo: '2023-06-01',
      bFrom: '2023-06-15',
      bTo: '2023-06-15',
    });
    expect(result.json).toMatchObject({
      metric: 'movingTimeH',
      periodA: { value: 1.5 },
      periodB: { value: 1 },
    });
  });

  it('lists the most ridden roads, 10 by default', () => {
    const result = run('route_frequency', { south: 51.49, west: -0.14, north: 51.52, east: -0.1 });
    const roads = result.json.roads as { lat: number; lng: number; rides: number }[];
    expect(roads.length).toBeLessThanOrEqual(10);
    expect(roads[0]?.rides).toBe(2);
  });

  it('summarizes the arguments for "Used: …"', () => {
    expect(tool('distance_by_month').summarize({ from: '2024-01-01', to: '2024-12-31' })).toBe(
      '2024-01-01 – 2024-12-31',
    );
    expect(tool('distance_by_year').summarize({})).toBe('all rides');
    expect(tool('location_visits').summarize({ lat: 51.5, lng: -0.12 })).toBe(
      '51.5, -0.12 within 100 m, all rides',
    );
  });
});

describe('AC-44: invalid arguments compute nothing and come back as problems', () => {
  it.each([
    ['distance_by_month', { from: '2024-13-01' }, 'from must be a date'],
    ['distance_by_month', { from: '2024-05-01', to: '2024-04-01' }, 'must not be after'],
    ['distance_by_month', { year: 2024 }, 'Unknown argument "year"'],
    ['distance_by_month', [2024], 'must be a JSON object'],
    ['distance_by_month', 'from 2024', 'must be a JSON object'],
    ['location_visits', { lat: 91, lng: 0 }, 'lat must be a latitude'],
    ['location_visits', { lng: 0 }, 'lat is required'],
    ['location_visits', { lat: 1, lng: 2, radiusM: 0 }, 'radiusM must be'],
    ['location_visits', { lat: { value: 1 }, lng: 2 }, 'lat must be a single value'],
    ['route_frequency', { south: 50, west: 0, north: 52, east: 1 }, 'at most 1°'],
    [
      'route_frequency',
      { south: 51, west: 0, north: 51.1, east: 0.1, limit: 26 },
      'limit must be a whole number 1–25',
    ],
    [
      'compare_periods',
      {
        metric: 'heartRate',
        aFrom: '2024-01-01',
        aTo: '2024-01-31',
        bFrom: '2024-02-01',
        bTo: '2024-02-29',
      },
      'metric must be one of',
    ],
    ['compare_periods', { metric: 'distanceKm', aFrom: '2024-01-01' }, 'aTo is required'],
  ])('%s %j', (name, args, problem) => {
    const result = run(name, args);
    expect(result.ok).toBe(false);
    expect(result.json.error).toBe('invalid-arguments');
    expect((result.json.problems as string[]).join(' ')).toContain(problem);
  });

  it('treats missing arguments as "no limit" where the analytics allow it', () => {
    expect(run('distance_by_month', undefined).ok).toBe(true);
    expect(run('distance_by_month', null).ok).toBe(true);
    expect(run('distance_by_month', { from: null, to: '' }).ok).toBe(true);
  });
});

describe('RULE-28: only what the question needs goes to the model', () => {
  it('never includes GPS points or ride IDs', () => {
    for (const [name, args] of [
      ['location_visits', { lat: 51.5, lng: -0.12 }],
      ['route_frequency', { south: 51.49, west: -0.14, north: 51.52, east: -0.1 }],
      ['distance_by_month', {}],
    ] as const) {
      const content = tool(name).run(args).content;
      expect(content).not.toMatch(/points|gpsTrack|activityId|timestamp/);
    }
  });

  it('names only the newest rides of a location and counts the rest', () => {
    const many: RideAnalytics = {
      ...analytics,
      locationVisits: (query) => ({
        latitude: query.latitude,
        longitude: query.longitude,
        radiusM: query.radiusM,
        visitCount: 30,
        rides: Array.from({ length: 30 }, (_, i) => ({
          activityId: String(i),
          activityName: `Ride ${i}`,
          activityDate: `2024-01-${String(i + 1).padStart(2, '0')}T08:00:00.000Z`,
          closestM: 12.4,
        })),
      }),
    };
    const json = JSON.parse(
      createAnalyticsTools(many, { timeZone: 'UTC' })[2]!.run({ lat: 1, lng: 2 }).content,
    );
    expect(json.newestRides).toHaveLength(MAX_NAMED_VISITS);
    expect(json.newestRides[0]).toEqual({ name: 'Ride 29', date: '2024-01-30', closestM: 12 });
    expect(json.otherRidesNotListed).toBe(30 - MAX_NAMED_VISITS);
  });

  it('cuts a result that is too large, and says so', () => {
    const months: MonthTotals[] = Array.from({ length: 600 }, (_, i) => ({
      year: 1990 + Math.floor(i / 12),
      month: ((i % 12) + 1) as MonthTotals['month'],
      rideCount: 12,
      distanceKm: 345.67,
      elevationGainM: 2345,
      movingTimeS: 50_000,
      ridesWithoutDistance: 0,
    }));
    const huge: RideAnalytics = { ...analytics, distanceByMonth: () => months };
    const content = createAnalyticsTools(huge)[0]!.run({}).content;
    expect(content.length).toBeLessThanOrEqual(MAX_TOOL_RESULT_BYTES);
    const json = JSON.parse(content);
    expect(json.truncated.omittedEntries).toBe(600 - json.months.length);
    expect(json.truncated.note).toMatch(/narrower date range/);
  });
});

// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { GPSPoint } from '../../../src/types/activity';
import { createRideAnalytics, type RideAnalytics } from '../../../server/analytics/rideAnalytics';
import { openRideRepository, type RideRepository } from '../../../server/rides/rideRepository';
import { ride, upload } from '../rideFixtures';

/*
 * AC-42: a SYNTHETIC ride history, stored in a real (in-memory) ride database, gives the expected
 * and reproducible analytics. Dates are in UTC so the expectations do not depend on the machine.
 */

const point = (latitude: number, longitude: number): GPSPoint => ({
  latitude: Math.round(latitude * 1e7) / 1e7,
  longitude: Math.round(longitude * 1e7) / 1e7,
  elevation: null,
  timestamp: null,
});
/** East–west road at a latitude, ~2 km long, points ~14 m apart. */
const road = (latitude: number, west = -0.135, east = -0.105): GPSPoint[] =>
  Array.from({ length: 151 }, (_, i) => point(latitude, west + ((east - west) * i) / 150));

// The place, a road 40 m north of it and a road 1.1 km north of it.
const PLACE = { latitude: 51.5, longitude: -0.12 };
const NEAR = road(51.5 + 40 / 111_195);
const FAR = road(51.51);

let repository: RideRepository;
let analytics: RideAnalytics;

beforeEach(() => {
  repository = openRideRepository(':memory:');
  repository.importUpload(
    upload(1, [
      ride('1', { activityDate: '2023-06-01T08:00:00.000Z', distanceKm: 20 }, NEAR),
      ride('2', { activityDate: '2023-06-15T08:00:00.000Z', distanceKm: 30 }, NEAR),
      ride('3', { activityDate: '2024-06-01T08:00:00.000Z', distanceKm: 40 }, FAR),
    ]),
  );
  repository.importUpload(
    upload(2, [
      ride('3', { activityDate: '2024-06-01T08:00:00.000Z', distanceKm: 40 }, FAR), // shared
      ride('4', { activityDate: '2024-07-01T08:00:00.000Z', distanceKm: null }, NEAR),
    ]),
  );
  analytics = createRideAnalytics(repository, 'UTC');
});
afterEach(() => repository.close());

const ALL = { from: null, to: null };

describe('BR-38 / AC-42: analytics over the stored history', () => {
  it('distance by month and year, each ride once although it is in two uploads', () => {
    expect(
      analytics.distanceByMonth(ALL).map((m) => [m.year, m.month, m.rideCount, m.distanceKm]),
    ).toEqual([
      [2023, 6, 2, 50],
      [2024, 6, 1, 40],
      [2024, 7, 1, 0],
    ]);
    expect(analytics.distanceByYear(ALL)).toEqual([
      expect.objectContaining({ year: 2023, rideCount: 2, distanceKm: 50 }),
      expect.objectContaining({
        year: 2024,
        rideCount: 2,
        distanceKm: 40,
        ridesWithoutDistance: 1,
      }),
    ]);
  });

  it('RULE-24: counts the distinct rides that passed within 100 m of a place', () => {
    const visits = analytics.locationVisits({ ...PLACE, radiusM: 100, range: ALL });

    expect(visits.visitCount).toBe(3);
    expect(visits.rides.map((r) => r.activityId)).toEqual(['1', '2', '4']);
    expect(visits.rides[0]?.closestM).toBeCloseTo(40, 0);
    expect(analytics.locationVisits({ ...PLACE, radiusM: 30, range: ALL }).visitCount).toBe(0);
    expect(
      analytics.locationVisits({ ...PLACE, radiusM: 2000, range: { from: '2024-01-01', to: null } })
        .visitCount,
    ).toBe(2);
  });

  it('ranks the most ridden roads in an area', () => {
    const roads = analytics.routeFrequency({
      bounds: { south: 51.49, west: -0.14, north: 51.52, east: -0.1 },
      limit: 3,
      range: ALL,
    });

    expect(roads).toHaveLength(3);
    expect(roads.every((r) => r.rideCount === 3)).toBe(true); // the near road: rides 1, 2 and 4
    expect(roads.every((r) => Math.abs(r.latitude - 51.5005) < 0.001)).toBe(true);

    const in2023 = analytics.routeFrequency({
      bounds: { south: 51.49, west: -0.14, north: 51.52, east: -0.1 },
      limit: 1,
      range: { from: '2023-01-01', to: '2023-12-31' },
    });
    expect(in2023[0]?.rideCount).toBe(2);
  });

  it('compares two periods on distance, rides and location visits', () => {
    const y2023 = { from: '2023-01-01', to: '2023-12-31' };
    const y2024 = { from: '2024-01-01', to: '2024-12-31' };

    expect(
      analytics.comparePeriods({
        metric: 'distanceKm',
        periodA: y2023,
        periodB: y2024,
        location: null,
      }),
    ).toEqual({
      metric: 'distanceKm',
      periodA: { ...y2023, value: 50 },
      periodB: { ...y2024, value: 40 },
      difference: -10,
      percentChange: -20,
    });
    expect(
      analytics.comparePeriods({
        metric: 'locationVisits',
        periodA: y2023,
        periodB: y2024,
        location: { ...PLACE, radiusM: 100 },
      }),
    ).toMatchObject({ periodA: { value: 2 }, periodB: { value: 1 }, difference: -1 });
  });

  it('returns the same results however often it is asked', () => {
    const ask = () => ({
      months: analytics.distanceByMonth(ALL),
      visits: analytics.locationVisits({ ...PLACE, radiusM: 100, range: ALL }),
      roads: analytics.routeFrequency({
        bounds: { south: 51.49, west: -0.14, north: 51.52, east: -0.1 },
        limit: 50,
        range: ALL,
      }),
    });

    expect(ask()).toEqual(ask());
  });

  it('follows deletions: a deleted upload no longer counts', () => {
    const [newest] = repository.listUploads();
    repository.deleteUploads([newest!.uploadId]); // ! safe: two uploads were stored

    expect(analytics.locationVisits({ ...PLACE, radiusM: 100, range: ALL }).visitCount).toBe(2);
    expect(analytics.distanceByYear(ALL).map((y) => y.rideCount)).toEqual([2, 1]);
  });
});

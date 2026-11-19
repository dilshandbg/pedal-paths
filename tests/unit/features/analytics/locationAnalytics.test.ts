import { describe, expect, it } from 'vitest';
import { comparePeriods } from '@/features/analytics/services/comparePeriods';
import {
  circleBounds,
  closestApproachM,
  countLocationVisits,
  DEFAULT_VISIT_RADIUS_M,
} from '@/features/analytics/services/locationVisits';
import { rankRoadFrequency } from '@/features/analytics/services/routeFrequency';
import { cellCentre, cellKey, cellKeyRanges } from '@/services/ride-history/rideCells';
import type { AnalyticsTrack, GPSPoint } from '@/types';
import { haversineDistanceKm } from '@/utils/geo';

/** SYNTHETIC tracks. */
const at = (latitude: number, longitude: number): GPSPoint => ({
  latitude,
  longitude,
  elevation: null,
  timestamp: null,
});
/** A straight line of points from `from` to `to`, about every 20 m. */
function line(from: GPSPoint, to: GPSPoint, steps = 20): GPSPoint[] {
  return Array.from({ length: steps + 1 }, (_, i) =>
    at(
      from.latitude + ((to.latitude - from.latitude) * i) / steps,
      from.longitude + ((to.longitude - from.longitude) * i) / steps,
    ),
  );
}
const track = (activityId: string, activityDate: string, points: GPSPoint[]): AnalyticsTrack => ({
  activityId,
  activityName: `Ride ${activityId}`,
  activityDate,
  distanceKm: 1,
  elevationGainM: null,
  movingTimeS: null,
  points,
});

// A place, and a road running east–west 50 m north of it.
const place = { latitude: 51.5, longitude: -0.12 };
const north50 = 50 / 111_195;
const road = line(at(51.5 + north50, -0.13), at(51.5 + north50, -0.11), 40);

describe('BR-38 / RULE-24: closest approach to a place', () => {
  it('measures to the line between points, not only to the points', () => {
    // Points 500 m apart east and west of the place, the line passes 50 m north of it.
    const sparse = [at(51.5 + north50, -0.1236), at(51.5 + north50, -0.1164)];

    expect(closestApproachM(sparse, place.latitude, place.longitude)).toBeCloseTo(50, 0);
  });

  it('ignores the line across a recording gap', () => {
    const gap = [at(51.5 + north50, -0.15), at(51.5 + north50, -0.09)]; // ~4 km apart

    expect(closestApproachM(gap, place.latitude, place.longitude)).toBeGreaterThan(2000);
  });

  it('works across the antimeridian and for a single point or none', () => {
    expect(closestApproachM([at(0, 179.9999)], 0, -179.9999)).toBeCloseTo(22.2, 0);
    expect(closestApproachM([at(51.5, -0.12)], 51.5, -0.12)).toBe(0);
    expect(closestApproachM([], 0, 0)).toBeNull();
  });
});

describe('BR-38 / AC-42: location visits', () => {
  const tracks = [
    track('1', '2024-01-10T08:00:00.000Z', road),
    track('2', '2024-02-10T08:00:00.000Z', [...road, ...[...road].reverse()]), // passes twice
    track('3', '2024-03-10T08:00:00.000Z', line(at(51.51, -0.13), at(51.51, -0.11))), // 1.1 km away
  ];

  it('counts distinct rides within the radius, oldest first, with how close they came', () => {
    const visits = countLocationVisits(
      tracks,
      { ...place, radiusM: DEFAULT_VISIT_RADIUS_M, range: { from: null, to: null } },
      'UTC',
    );

    expect(visits.visitCount).toBe(2);
    expect(visits.rides.map((r) => r.activityId)).toEqual(['1', '2']);
    expect(visits.rides[0]?.closestM).toBeCloseTo(50, 0);
  });

  it('respects the radius boundary and the date range', () => {
    const query = (radiusM: number, from: string | null = null) =>
      countLocationVisits(tracks, { ...place, radiusM, range: { from, to: null } }, 'UTC');

    expect(query(49).visitCount).toBe(0);
    expect(query(51).visitCount).toBe(2);
    expect(query(5000).visitCount).toBe(3);
    expect(query(5000, '2024-02-01').rides.map((r) => r.activityId)).toEqual(['2', '3']);
  });

  it('counts a ride listed twice once', () => {
    const visits = countLocationVisits(
      [tracks[0]!, tracks[0]!], // ! safe: the fixture has three tracks
      { ...place, radiusM: 100, range: { from: null, to: null } },
    );

    expect(visits.visitCount).toBe(1);
  });

  it('finds every candidate through the location cells around the place', () => {
    const bounds = circleBounds(place.latitude, place.longitude, 100);
    const keys = new Set(
      cellKeyRanges(bounds).flatMap(([first, last]) =>
        Array.from({ length: last - first + 1 }, (_, i) => first + i),
      ),
    );

    // The road's closest point lies in a cell of the circle's bounds.
    const closest = road.reduce((best, p) =>
      haversineDistanceKm(p, place) < haversineDistanceKm(best, place) ? p : best,
    );
    expect(keys.has(cellKey(closest.latitude, closest.longitude))).toBe(true);
    expect(bounds.north - place.latitude).toBeCloseTo(100 / 111_195, 6);
  });
});

describe('ADR-0013 §5: cell ranges and centres', () => {
  it('gives one contiguous key range per grid row', () => {
    const ranges = cellKeyRanges({ south: 10.0005, west: 20.0005, north: 10.0025, east: 20.0035 });

    expect(ranges).toHaveLength(3);
    for (const [first, last] of ranges) expect(last - first).toBe(3);
    expect(ranges[0]?.[0]).toBe(cellKey(10.0005, 20.0005));
  });

  it('turns a key back into its cell centre', () => {
    expect(cellCentre(cellKey(51.50049, -0.12049))).toEqual({
      latitude: 51.5005,
      longitude: -0.1205,
    });
    expect(cellCentre(cellKey(-89.9999, -179.9999))).toEqual({
      latitude: -89.9995,
      longitude: -179.9995,
    });
  });
});

describe('BR-38 / AC-42: most ridden roads', () => {
  const visits = [
    { cellKey: 2, activityId: 'a' },
    { cellKey: 2, activityId: 'a' }, // the same ride twice counts once
    { cellKey: 2, activityId: 'b' },
    { cellKey: 1, activityId: 'a' },
    { cellKey: 3, activityId: 'b' },
  ];

  it('ranks cells by distinct rides, ties by cell, and stops at the limit', () => {
    const ranked = rankRoadFrequency(visits, 2);

    expect(ranked.map((r) => r.rideCount)).toEqual([2, 1]);
    expect(ranked[0]).toEqual({ ...cellCentre(2), rideCount: 2 });
    expect(ranked[1]).toEqual({ ...cellCentre(1), rideCount: 1 });
  });

  it('counts only the given rides, and gives the same answer for any order', () => {
    expect(rankRoadFrequency(visits, 10, new Set(['b'])).map((r) => r.rideCount)).toEqual([1, 1]);
    expect(rankRoadFrequency([...visits].reverse(), 10)).toEqual(rankRoadFrequency(visits, 10));
    expect(rankRoadFrequency([], 10)).toEqual([]);
  });
});

describe('BR-38 / AC-42: comparing periods', () => {
  const a = { from: '2023-01-01', to: '2023-12-31' };
  const b = { from: '2024-01-01', to: '2024-12-31' };

  it('reports both values, the difference and the change in percent', () => {
    expect(comparePeriods('distanceKm', a, b, (range) => (range === a ? 200 : 250))).toEqual({
      metric: 'distanceKm',
      periodA: { ...a, value: 200 },
      periodB: { ...b, value: 250 },
      difference: 50,
      percentChange: 25,
    });
  });

  it('has no percent change when period A is zero', () => {
    expect(comparePeriods('rideCount', a, b, (range) => (range === a ? 0 : 3))).toMatchObject({
      difference: 3,
      percentChange: null,
    });
  });
});

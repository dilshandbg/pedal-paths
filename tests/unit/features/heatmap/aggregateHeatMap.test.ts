import { describe, expect, it } from 'vitest';
import {
  aggregateHeatMap,
  frequencyToIntensity,
} from '@/features/heatmap/services/aggregateHeatMap';
import { buildSegmentIndex } from '@/features/heatmap/services/buildSegmentIndex';
import { METRES_PER_DEGREE_LAT } from '@/features/heatmap/utils/grid';
import type { CyclingActivity, GPSPoint, HeatMapData } from '@/types';

const metres = (m: number) => m / METRES_PER_DEGREE_LAT;

/** Points every 10 m from (lat0, lon0) along a bearing given in metres-per-step (north, east). */
function track(
  steps: number,
  { lat0 = 0.001, lon0 = 0.001, north = 10, east = 0 } = {},
): GPSPoint[] {
  return Array.from({ length: steps + 1 }, (_, k) => ({
    latitude: lat0 + metres(k * north),
    longitude: lon0 + metres(k * east),
    elevation: null,
    timestamp: null,
  }));
}

const ride = (activityId: string, gpsTrack: GPSPoint[]): CyclingActivity => ({
  activityId,
  activityName: activityId,
  activityDate: '2024-01-01T00:00:00.000Z',
  year: 2024,
  month: 1,
  distanceKm: null,
  elevationGainM: null,
  gpsTrack,
});

const totalSegments = (data: HeatMapData, frequency: number) =>
  data.paths
    .filter((path) => path.frequency === frequency)
    .reduce((sum, path) => sum + path.coordinates.length - 1, 0);

describe('BR-12: traversal-frequency aggregation', () => {
  const road = track(100); // 1 km north
  const sideStreet = track(50, { lat0: 0.001 + metres(1000), north: 0, east: 10 }); // 500 m east

  it('AC-12: roads ridden by more rides get higher frequency and intensity', () => {
    const rides = [
      ride('a', road),
      ride('b', road),
      ride('c', road),
      ride('d', [...road, ...sideStreet]),
    ];
    const data = aggregateHeatMap(
      buildSegmentIndex(rides),
      rides.map((r) => r.activityId),
    );

    expect(data.maxFrequency).toBe(4);
    const main = data.paths.find((p) => p.frequency === 4);
    const side = data.paths.find((p) => p.frequency === 1);
    expect(main).toBeDefined();
    expect(side).toBeDefined();
    expect(main?.intensity).toBe(1);
    expect(side?.intensity ?? 1).toBeLessThan(main?.intensity ?? 0);
    expect(side?.intensity ?? 0).toBeGreaterThan(0);
  });

  it('RULE-10: is about how often a road is ridden, not distance: a longer ride is not hotter', () => {
    const short = ride('short', track(20));
    const long = ride('long', track(100));
    const data = aggregateHeatMap(buildSegmentIndex([short, long]), ['short', 'long']);

    expect(data.maxFrequency).toBe(2); // the shared first 200 m
    expect(totalSegments(data, 1)).toBeGreaterThan(0); // the rest, ridden once
  });

  it('counts a road once per ride, even if one ride loops it several times', () => {
    const outAndBack = [...road, ...[...road].reverse(), ...road];
    const data = aggregateHeatMap(buildSegmentIndex([ride('laps', outAndBack)]), ['laps']);

    expect(data.maxFrequency).toBe(1);
  });

  it('absorbs GPS scatter: two rides a few metres apart count as the same road', () => {
    const shifted = track(100, { lon0: 0.001 + metres(3) });
    const data = aggregateHeatMap(buildSegmentIndex([ride('a', road), ride('b', shifted)]), [
      'a',
      'b',
    ]);

    const shared = totalSegments(data, 2);
    const separate = totalSegments(data, 1);
    expect(shared / (shared + separate)).toBeGreaterThan(0.8);
  });

  it('AC-09: leaving a ride out removes its contribution', () => {
    const rides = [ride('a', road), ride('b', road), ride('c', [...road, ...sideStreet])];
    const index = buildSegmentIndex(rides);

    const all = aggregateHeatMap(index, ['a', 'b', 'c']);
    const withoutC = aggregateHeatMap(index, ['a', 'b']);

    expect(all.maxFrequency).toBe(3);
    expect(withoutC.maxFrequency).toBe(2);
    expect(totalSegments(withoutC, 1)).toBe(0); // the side street was only ridden by c
    expect(withoutC.activityIds).toEqual(['a', 'b']);
  });

  it('merges a straight road with one frequency into a single path', () => {
    const data = aggregateHeatMap(buildSegmentIndex([ride('a', road)]), ['a']);

    expect(data.paths).toHaveLength(1);
    expect(data.paths[0]?.coordinates.length).toBeGreaterThan(30);
  });

  it('splits paths where the frequency changes', () => {
    const rides = [ride('a', road), ride('b', track(50))];
    const data = aggregateHeatMap(buildSegmentIndex(rides), ['a', 'b']);

    expect(data.paths.map((p) => p.frequency).sort()).toEqual([1, 2]);
  });

  it('follows the actual GPS positions, not just cell centres', () => {
    const data = aggregateHeatMap(buildSegmentIndex([ride('a', road)]), ['a']);
    const lngs = data.paths.flatMap((p) => p.coordinates.map(([lng]) => lng));
    // Every point of the ride has longitude 0.001, so the drawn path stays on it.
    for (const lng of lngs) {
      expect(lng).toBeCloseTo(0.001, 9);
    }
  });

  it('does not join points across a long GPS gap', () => {
    const before = track(10);
    const after = track(10, { lat0: 0.001 + metres(5000) });
    const data = aggregateHeatMap(buildSegmentIndex([ride('gap', [...before, ...after])]), ['gap']);

    const segmentCount = data.paths.reduce((sum, p) => sum + p.coordinates.length - 1, 0);
    expect(segmentCount).toBeLessThan(20); // ~4 + ~4 cells, not 200 bridging the gap
  });

  it('draws busier roads last so they stay on top', () => {
    const rides = [ride('a', road), ride('b', road), ride('c', [...road, ...sideStreet])];
    const data = aggregateHeatMap(buildSegmentIndex(rides), ['a', 'b', 'c']);
    const frequencies = data.paths.map((p) => p.frequency);

    expect(frequencies).toEqual([...frequencies].sort((x, y) => x - y));
  });

  it('ignores unknown activity IDs and returns empty data for nothing selected', () => {
    const index = buildSegmentIndex([ride('a', road)]);

    expect(aggregateHeatMap(index, [])).toEqual({ paths: [], maxFrequency: 0, activityIds: [] });
    expect(aggregateHeatMap(index, ['missing']).paths).toEqual([]);
  });
});

describe('frequencyToIntensity', () => {
  it('maps 0..max onto a monotonic 0..1 log scale', () => {
    expect(frequencyToIntensity(0, 10)).toBe(0);
    expect(frequencyToIntensity(10, 10)).toBe(1);
    const values = [1, 2, 5, 9, 10].map((f) => frequencyToIntensity(f, 10));
    expect(values).toEqual([...values].sort((a, b) => a - b));
  });

  it('keeps a once-ridden road visible next to a daily commute', () => {
    expect(frequencyToIntensity(1, 300)).toBeGreaterThan(0.1); // linear would be 0.003
  });

  it('is 0 when there is no data', () => {
    expect(frequencyToIntensity(1, 0)).toBe(0);
  });
});

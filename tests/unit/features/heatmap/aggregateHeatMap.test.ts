import { describe, expect, it } from 'vitest';
import {
  aggregateHeatMap,
  frequencyToIntensity,
} from '@/features/heatmap/services/aggregateHeatMap';
import { buildHeatMapGeometry } from '@/features/heatmap/services/buildHeatMapGeometry';
import { buildSegmentIndex } from '@/features/heatmap/services/buildSegmentIndex';
import { METRES_PER_DEGREE_LAT } from '@/features/heatmap/utils/grid';
import type { CyclingActivity, GPSPoint, HeatMapData, SegmentIndex } from '@/types';

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
  activityDate: '2024-01-01T08:00:00.000Z',
  year: 2024,
  month: 1,
  distanceKm: null,
  elevationGainM: null,
  gpsTrack,
});

function aggregate(rides: readonly CyclingActivity[], ids = rides.map((r) => r.activityId)) {
  const index = buildSegmentIndex(rides);
  return aggregateHeatMap(index, buildHeatMapGeometry(index), ids);
}

/** Number of segments drawn with exactly this frequency. */
const segmentsWith = (data: HeatMapData, frequency: number) =>
  data.segmentFrequency.filter((f) => f === frequency).length;
const drawnSegments = (data: HeatMapData) => data.segmentFrequency.filter((f) => f > 0).length;

describe('BR-12: traversal-frequency aggregation', () => {
  const road = track(100); // 1 km north
  const sideStreet = track(50, { lat0: 0.001 + metres(1000), north: 0, east: 10 }); // 500 m east

  it('AC-12: roads ridden by more rides get higher frequency and intensity', () => {
    const data = aggregate([
      ride('a', road),
      ride('b', road),
      ride('c', road),
      ride('d', [...road, ...sideStreet]),
    ]);

    expect(data.maxFrequency).toBe(4);
    expect(segmentsWith(data, 4)).toBeGreaterThan(30); // the main road
    expect(segmentsWith(data, 1)).toBeGreaterThan(15); // the side street
    expect(data.intensityByFrequency[4]).toBe(1);
    expect(data.intensityByFrequency[1]).toBeGreaterThan(0);
    expect(data.intensityByFrequency[1]).toBeLessThan(data.intensityByFrequency[4] ?? 0);
  });

  it('RULE-10: is about how often a road is ridden, not distance: a longer ride is not hotter', () => {
    const data = aggregate([ride('short', track(20)), ride('long', track(100))]);

    expect(data.maxFrequency).toBe(2); // the shared first 200 m
    expect(segmentsWith(data, 1)).toBeGreaterThan(0); // the rest, ridden once
  });

  it('counts a road once per ride, even if one ride loops it several times', () => {
    const outAndBack = [...road, ...[...road].reverse(), ...road];
    expect(aggregate([ride('laps', outAndBack)]).maxFrequency).toBe(1);
  });

  it('absorbs GPS scatter: two rides a few metres apart count as the same road', () => {
    const shifted = track(100, { lon0: 0.001 + metres(3) });
    const data = aggregate([ride('a', road), ride('b', shifted)]);

    const shared = segmentsWith(data, 2);
    expect(shared / drawnSegments(data)).toBeGreaterThan(0.8);
  });

  it('AC-09: leaving a ride out removes its contribution', () => {
    const rides = [ride('a', road), ride('b', road), ride('c', [...road, ...sideStreet])];
    const index = buildSegmentIndex(rides);
    const geometry = buildHeatMapGeometry(index);

    const all = aggregateHeatMap(index, geometry, ['a', 'b', 'c']);
    const withoutC = aggregateHeatMap(index, geometry, ['a', 'b']);

    expect(all.maxFrequency).toBe(3);
    expect(withoutC.maxFrequency).toBe(2);
    expect(segmentsWith(withoutC, 1)).toBe(0); // the side street was only ridden by c
    expect(withoutC.activityIds).toEqual(['a', 'b']);
  });

  it('reuses the same drawing geometry for every selection (NFR-02)', () => {
    const rides = [ride('a', road), ride('b', sideStreet)];
    const index = buildSegmentIndex(rides);
    const geometry = buildHeatMapGeometry(index);

    const first = aggregateHeatMap(index, geometry, ['a']);
    const second = aggregateHeatMap(index, geometry, ['b']);

    expect(first.geometry).toBe(geometry);
    expect(second.geometry).toBe(geometry);
    expect(first.segmentFrequency).toHaveLength(geometry.segmentCount);
    expect(first.cellFrequency).toHaveLength(geometry.cellCount);
  });

  it('gives each joint the frequency of the busiest road meeting there', () => {
    // Two rides on the main road, one of them continuing onto the side street.
    const data = aggregate([ride('a', road), ride('b', [...road, ...sideStreet])]);
    const index = buildSegmentIndex([ride('a', road), ride('b', [...road, ...sideStreet])]);

    expect(maxCellFrequencyAtEndsOf(index, data, 2)).toBe(2);
    // Every drawn segment's end cells are drawn at least as hot as the segment itself.
    for (let s = 0; s < data.segmentFrequency.length; s += 1) {
      const f = data.segmentFrequency[s] ?? 0;
      const a = index.segmentCells[s * 2] ?? 0;
      const b = index.segmentCells[s * 2 + 1] ?? 0;
      expect(data.cellFrequency[a] ?? 0).toBeGreaterThanOrEqual(f);
      expect(data.cellFrequency[b] ?? 0).toBeGreaterThanOrEqual(f);
    }
    // No cell is drawn hotter than the busiest road through it.
    expect(Math.max(...data.cellFrequency)).toBe(data.maxFrequency);
  });

  it('does not draw cells that no selected ride touches', () => {
    const rides = [ride('a', road), ride('b', sideStreet)];
    const index = buildSegmentIndex(rides);
    const data = aggregateHeatMap(index, buildHeatMapGeometry(index), ['a']);

    const drawnCells = data.cellFrequency.filter((f) => f > 0).length;
    expect(drawnCells).toBeGreaterThan(30);
    expect(drawnCells).toBeLessThan(data.cellFrequency.length);
  });

  it('does not join points across a long GPS gap', () => {
    const before = track(10);
    const after = track(10, { lat0: 0.001 + metres(5000) });
    const data = aggregate([ride('gap', [...before, ...after])]);

    expect(drawnSegments(data)).toBeLessThan(20); // ~4 + ~4 cells, not 200 bridging the gap
  });

  it('ignores unknown activity IDs and draws nothing when nothing is selected', () => {
    const index = buildSegmentIndex([ride('a', road)]);
    const geometry = buildHeatMapGeometry(index);

    const none = aggregateHeatMap(index, geometry, []);
    expect(none.maxFrequency).toBe(0);
    expect(none.activityIds).toEqual([]);
    expect(drawnSegments(none)).toBe(0);
    expect(none.cellFrequency.every((f) => f === 0)).toBe(true);
    expect([...none.intensityByFrequency]).toEqual([0]);

    const unknown = aggregateHeatMap(index, geometry, ['missing']);
    expect(drawnSegments(unknown)).toBe(0);
  });

  it('lists an intensity for every frequency up to the maximum, on the log scale', () => {
    const data = aggregate([ride('a', road), ride('b', road), ride('c', track(30))]);

    expect(data.intensityByFrequency).toHaveLength(data.maxFrequency + 1);
    for (let f = 0; f <= data.maxFrequency; f += 1) {
      expect(data.intensityByFrequency[f]).toBeCloseTo(
        frequencyToIntensity(f, data.maxFrequency),
        6,
      );
    }
  });
});

function maxCellFrequencyAtEndsOf(
  index: SegmentIndex,
  data: HeatMapData,
  frequency: number,
): number {
  let max = 0;
  for (let s = 0; s < data.segmentFrequency.length; s += 1) {
    if (data.segmentFrequency[s] !== frequency) continue;
    for (const cell of [index.segmentCells[s * 2] ?? 0, index.segmentCells[s * 2 + 1] ?? 0]) {
      max = Math.max(max, data.cellFrequency[cell] ?? 0);
    }
  }
  return max;
}

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

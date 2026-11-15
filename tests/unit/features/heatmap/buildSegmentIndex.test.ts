// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildSegmentIndex } from '@/features/heatmap/services/buildSegmentIndex';
import { METRES_PER_DEGREE_LAT } from '@/features/heatmap/utils/grid';
import type { CyclingActivity, GPSPoint } from '@/types';

const metres = (m: number) => m / METRES_PER_DEGREE_LAT;

const northbound = (steps: number, stepM = 10): GPSPoint[] =>
  Array.from({ length: steps + 1 }, (_, k) => ({
    latitude: 0.001 + metres(k * stepM),
    longitude: 0.001,
    elevation: null,
    timestamp: null,
  }));

const ride = (activityId: string, gpsTrack: GPSPoint[]): CyclingActivity => ({
  activityId,
  activityName: activityId,
  activityDate: '2024-01-01T00:00:00.000Z',
  year: 2024,
  month: 1,
  distanceKm: null,
  elevationGainM: null,
  movingTimeS: null,
  gpsTrack,
});

describe('buildSegmentIndex', () => {
  it('records the distinct segments each ride traverses, sorted', () => {
    const index = buildSegmentIndex([ride('a', northbound(100))]); // 1 km

    const segments = index.activitySegments.get('a');
    expect(segments).toBeInstanceOf(Uint32Array);
    // ~1000 m / 25 m cells = ~40 segments.
    expect(segments?.length).toBeGreaterThanOrEqual(38);
    expect(segments?.length).toBeLessThanOrEqual(42);
    expect([...(segments ?? [])]).toEqual([...(segments ?? [])].sort((a, b) => a - b));
  });

  it('shares segment IDs between rides on the same road', () => {
    const index = buildSegmentIndex([ride('a', northbound(100)), ride('b', northbound(50))]);

    const a = new Set(index.activitySegments.get('a'));
    const b = index.activitySegments.get('b') ?? new Uint32Array();
    expect(b.length).toBeGreaterThan(0);
    expect([...b].every((segment) => a.has(segment))).toBe(true);
    expect(index.segmentCells.length / 2).toBe(a.size); // no new segments for b
  });

  it('builds a consistent cell ↔ segment adjacency', () => {
    const index = buildSegmentIndex([ride('a', northbound(40))]);
    const segmentCount = index.segmentCells.length / 2;
    const cellCount = index.cellSegmentOffsets.length - 1;

    expect(index.cellLngLat.length).toBe(cellCount * 2);
    expect(index.cellSegments.length).toBe(segmentCount * 2);
    for (let cell = 0; cell < cellCount; cell += 1) {
      const from = index.cellSegmentOffsets[cell] ?? 0;
      const to = index.cellSegmentOffsets[cell + 1] ?? 0;
      for (let k = from; k < to; k += 1) {
        const segment = index.cellSegments[k] ?? 0;
        const ends = [index.segmentCells[segment * 2], index.segmentCells[segment * 2 + 1]];
        expect(ends).toContain(cell);
      }
    }
  });

  it('skips rides that never leave a single cell', () => {
    const index = buildSegmentIndex([ride('still', northbound(1, 1))]);
    expect(index.activitySegments.has('still')).toBe(false);
  });

  it('handles an empty dataset', () => {
    const index = buildSegmentIndex([]);
    expect(index.activitySegments.size).toBe(0);
    expect(index.segmentCells.length).toBe(0);
    expect([...index.cellSegmentOffsets]).toEqual([0]);
  });

  it('survives structured cloning, as when posted from the import worker', () => {
    const index = buildSegmentIndex([ride('a', northbound(20))]);
    const copy = structuredClone(index);
    expect(copy.activitySegments.get('a')).toEqual(index.activitySegments.get('a'));
    expect(copy.cellLngLat).toEqual(index.cellLngLat);
  });
});

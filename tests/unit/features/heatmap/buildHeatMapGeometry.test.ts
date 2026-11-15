import { describe, expect, it } from 'vitest';
import { buildHeatMapGeometry } from '@/features/heatmap/services/buildHeatMapGeometry';
import { buildSegmentIndex } from '@/features/heatmap/services/buildSegmentIndex';
import { METRES_PER_DEGREE_LAT } from '@/features/heatmap/utils/grid';
import type { CyclingActivity } from '@/types';

const northbound = (steps: number): CyclingActivity => ({
  activityId: 'a',
  activityName: 'a',
  activityDate: '2024-01-01T08:00:00.000Z',
  year: 2024,
  month: 1,
  distanceKm: null,
  elevationGainM: null,
  movingTimeS: null,
  gpsTrack: Array.from({ length: steps + 1 }, (_, k) => ({
    latitude: 0.001 + (k * 10) / METRES_PER_DEGREE_LAT,
    longitude: 0.001,
    elevation: null,
    timestamp: null,
  })),
});

describe('buildHeatMapGeometry', () => {
  it('places each segment between the positions of its two end cells', () => {
    const index = buildSegmentIndex([northbound(40)]);
    const geometry = buildHeatMapGeometry(index);

    expect(geometry.segmentCount).toBe(index.segmentCells.length / 2);
    expect(geometry.segmentSources).toHaveLength(geometry.segmentCount * 2);
    expect(geometry.segmentTargets).toHaveLength(geometry.segmentCount * 2);
    for (let s = 0; s < geometry.segmentCount; s += 1) {
      const a = index.segmentCells[s * 2] ?? 0;
      const b = index.segmentCells[s * 2 + 1] ?? 0;
      expect(geometry.segmentSources[s * 2]).toBe(index.cellLngLat[a * 2]);
      expect(geometry.segmentSources[s * 2 + 1]).toBe(index.cellLngLat[a * 2 + 1]);
      expect(geometry.segmentTargets[s * 2]).toBe(index.cellLngLat[b * 2]);
      expect(geometry.segmentTargets[s * 2 + 1]).toBe(index.cellLngLat[b * 2 + 1]);
    }
  });

  it('follows the actual GPS positions, not just cell centres', () => {
    const geometry = buildHeatMapGeometry(buildSegmentIndex([northbound(100)]));
    // Every point of the ride has longitude 0.001, so every drawn position stays on it.
    for (let k = 0; k < geometry.cellCount; k += 1) {
      expect(geometry.cellPositions[k * 2]).toBeCloseTo(0.001, 9);
    }
  });

  it('shares the index cell positions instead of copying them', () => {
    const index = buildSegmentIndex([northbound(10)]);
    const geometry = buildHeatMapGeometry(index);
    expect(geometry.cellPositions).toBe(index.cellLngLat);
    expect(geometry.cellCount).toBe(index.cellLngLat.length / 2);
  });

  it('is empty for an empty index', () => {
    const geometry = buildHeatMapGeometry(buildSegmentIndex([]));
    expect(geometry.segmentCount).toBe(0);
    expect(geometry.cellCount).toBe(0);
  });
});

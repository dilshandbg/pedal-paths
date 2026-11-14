import { describe, expect, it } from 'vitest';
import { computeBounds } from '@/features/heatmap/utils/bounds';
import type { CyclingActivity, GPSPoint } from '@/types';

const point = (latitude: number, longitude: number): GPSPoint => ({
  latitude,
  longitude,
  elevation: null,
  timestamp: null,
});

const ride = (activityId: string, track: GPSPoint[]): CyclingActivity => ({
  activityId,
  activityName: activityId,
  activityDate: '2024-01-01T00:00:00.000Z',
  year: 2024,
  month: 1,
  distanceKm: null,
  elevationGainM: null,
  gpsTrack: track,
});

describe('computeBounds', () => {
  it('covers every point of every ride', () => {
    expect(
      computeBounds([
        ride('a', [point(10, 20), point(12, 18)]),
        ride('b', [point(-5, 25), point(11, 19)]),
      ]),
    ).toEqual({ west: 18, south: -5, east: 25, north: 12 });
  });

  it('returns null when there are no points', () => {
    expect(computeBounds([])).toBeNull();
    expect(computeBounds([ride('empty', [])])).toBeNull();
  });
});

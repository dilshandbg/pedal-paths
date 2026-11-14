import { describe, expect, it } from 'vitest';
import { buildRoutePaths } from '@/features/heatmap/services/buildRoutePaths';
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

describe('BR-06: buildRoutePaths', () => {
  it('creates one [lng, lat] path per ride', () => {
    const data = buildRoutePaths([
      ride('a', [point(10, 20), point(10.1, 20.1)]),
      ride('b', [point(-5, 100), point(-5.1, 100.1)]),
    ]);

    expect(data.paths).toEqual([
      {
        coordinates: [
          [20, 10],
          [20.1, 10.1],
        ],
        frequency: 1,
        intensity: 1,
        activityIds: ['a'],
      },
      {
        coordinates: [
          [100, -5],
          [100.1, -5.1],
        ],
        frequency: 1,
        intensity: 1,
        activityIds: ['b'],
      },
    ]);
    expect(data.activityIds).toEqual(['a', 'b']);
    expect(data.maxFrequency).toBe(1);
  });

  it('decimates dense tracks before rendering', () => {
    const dense = Array.from({ length: 1001 }, (_, i) => point(i / 111_195, 0)); // 1 m apart

    const [path] = buildRoutePaths([ride('dense', dense)], { minPointSpacingM: 10 }).paths;

    expect(path?.coordinates.length).toBeLessThanOrEqual(102);
    expect(path?.coordinates.length).toBeGreaterThanOrEqual(100);
  });

  it('returns empty data for no rides', () => {
    expect(buildRoutePaths([])).toEqual({ paths: [], maxFrequency: 0, activityIds: [] });
  });
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

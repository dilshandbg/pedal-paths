import { describe, expect, it } from 'vitest';
import {
  ELEVATION_GAIN_THRESHOLD_M,
  trackDistanceKm,
  trackElevationGainM,
} from '@/features/activities/utils/trackMetrics';
import type { GPSPoint } from '@/types';
import { EARTH_RADIUS_KM } from '@/utils/geo';

const point = (latitude: number, elevation: number | null = null): GPSPoint => ({
  latitude,
  longitude: 0,
  elevation,
  timestamp: null,
});

describe('trackDistanceKm', () => {
  it('sums consecutive segment distances', () => {
    const oneDegree = (Math.PI * EARTH_RADIUS_KM) / 180;
    expect(trackDistanceKm([point(0), point(1), point(2)])).toBeCloseTo(2 * oneDegree, 6);
  });

  it('is 0 for fewer than two points', () => {
    expect(trackDistanceKm([])).toBe(0);
    expect(trackDistanceKm([point(0)])).toBe(0);
  });
});

describe('trackElevationGainM', () => {
  it('adds up climbs', () => {
    const track = [point(0, 100), point(0, 110), point(0, 105), point(0, 125)];
    expect(trackElevationGainM(track)).toBe(30); // +10, then 105 → 125 = +20
  });

  it('ignores jitter smaller than the threshold', () => {
    const jitter = [100, 101, 100, 102, 100, 101, 100].map((e) => point(0, e));
    expect(trackElevationGainM(jitter)).toBe(0);
    expect(ELEVATION_GAIN_THRESHOLD_M).toBeGreaterThan(2);
  });

  it('skips points without elevation', () => {
    expect(trackElevationGainM([point(0, 100), point(0, null), point(0, 150)])).toBe(50);
  });

  it('returns null when fewer than two points have elevation', () => {
    expect(trackElevationGainM([point(0, null), point(0, null)])).toBeNull();
    expect(trackElevationGainM([point(0, 100)])).toBeNull();
  });

  it('never counts descents', () => {
    expect(trackElevationGainM([point(0, 500), point(0, 300), point(0, 100)])).toBe(0);
  });
});

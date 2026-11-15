import { describe, expect, it } from 'vitest';
import { MAX_GRADE_WINDOW_M, segmentStatistics } from '@/features/segments/utils/segmentStatistics';
import type { Coordinate } from '@/types';
import { segmentRecord } from './fixtures';

/** SYNTHETIC route of `n` points with the given samples. Not real Strava data. */
const withSamples = (altitude: number[], distance: number[]) => {
  const route: Coordinate[] = altitude.map((_, i) => ({ latitude: 10 + i * 0.001, longitude: 20 }));
  return segmentRecord({
    route,
    altitudeSamplesM: altitude,
    distanceSamplesM: distance,
    distanceM: null,
    elevationGainM: null,
    averageGradePct: null,
    maximumGradePct: null,
    elevationLowM: null,
    elevationHighM: null,
  });
};

describe('BR-25 / BR-29 / RULE-20: segmentStatistics', () => {
  it('uses the values stated in the file as given', () => {
    const stats = segmentStatistics(
      segmentRecord({ altitudeSamplesM: [1, 2, 3], distanceSamplesM: [0, 50, 100] }),
    );
    expect(stats).toEqual({
      distanceM: { value: 1500, source: 'file' },
      elevationGainM: { value: 80, source: 'file' },
      averageGradePct: { value: 5.3, source: 'file' },
      maximumGradePct: { value: 11, source: 'file' },
      elevationLowM: { value: 100, source: 'file' },
      elevationHighM: { value: 180, source: 'file' },
    });
  });

  it('derives missing values from the altitude and distance samples', () => {
    // 0–200 m: +10 m, 200–300 m: −5 m, 300–400 m: +15 m (15 % over the last 100 m).
    const stats = segmentStatistics(withSamples([100, 110, 105, 120], [0, 200, 300, 400]));
    expect(stats.distanceM).toEqual({ value: 400, source: 'samples' });
    expect(stats.elevationGainM).toEqual({ value: 25, source: 'samples' });
    expect(stats.averageGradePct).toEqual({ value: 5, source: 'samples' });
    expect(stats.maximumGradePct?.value).toBeCloseTo(15);
    expect(stats.elevationLowM).toEqual({ value: 100, source: 'samples' });
    expect(stats.elevationHighM).toEqual({ value: 120, source: 'samples' });
  });

  it(`measures the maximum grade over at least ${MAX_GRADE_WINDOW_M} m, ignoring a single steep step`, () => {
    // A 10 m step at +3 m (30 %) inside 200 m that are otherwise flat.
    const stats = segmentStatistics(withSamples([100, 100, 103, 103, 103], [0, 50, 60, 150, 200]));
    expect(stats.maximumGradePct?.value).toBeCloseTo(3); // 3 m over the 100 m from 50 m
  });

  it('uses the whole segment for the maximum grade when it is shorter than the window', () => {
    const stats = segmentStatistics(withSamples([10, 12, 14], [0, 20, 40]));
    expect(stats.maximumGradePct?.value).toBeCloseTo(10);
  });

  it('handles a descent: no gain, a negative average grade', () => {
    const stats = segmentStatistics(withSamples([200, 190, 180], [0, 100, 200]));
    expect(stats.elevationGainM?.value).toBe(0);
    expect(stats.averageGradePct?.value).toBe(-10);
  });

  it('estimates nothing without samples', () => {
    const stats = segmentStatistics(withSamples([], []));
    const bare = segmentStatistics({
      ...withSamples([1, 2], [0, 10]),
      altitudeSamplesM: null,
      distanceSamplesM: null,
    });
    expect(Object.values(bare).every((value) => value === null)).toBe(true);
    expect(stats.distanceM).toBeNull();
  });

  it('derives the range from altitude alone, but grades only with distances', () => {
    const segment = { ...withSamples([5, 9], [0, 100]), distanceSamplesM: null };
    const stats = segmentStatistics(segment);
    expect(stats.elevationHighM?.value).toBe(9);
    expect(stats.elevationGainM?.value).toBe(4);
    expect(stats.averageGradePct).toBeNull();
    expect(stats.maximumGradePct).toBeNull();
  });

  it('ignores a zero-length distance span', () => {
    const stats = segmentStatistics(withSamples([5, 9], [0, 0]));
    expect(stats.averageGradePct).toBeNull();
    expect(stats.maximumGradePct).toBeNull();
  });
});

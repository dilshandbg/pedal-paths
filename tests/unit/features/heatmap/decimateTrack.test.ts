import { describe, expect, it } from 'vitest';
import { decimateTrack } from '@/features/heatmap/utils/decimateTrack';

const METRES_PER_DEGREE = 111_195;
/** Points heading north from 0,0, `stepM` metres apart. */
const line = (count: number, stepM: number) =>
  Array.from({ length: count }, (_, i) => ({
    latitude: (i * stepM) / METRES_PER_DEGREE,
    longitude: 0,
  }));

describe('decimateTrack', () => {
  it('keeps points that are at least the minimum spacing apart', () => {
    const points = line(11, 4); // 4 m apart, 40 m in total

    const kept = decimateTrack(points, 10);

    // From 0 m: next kept at 12 m (≥10), 24 m, 36 m, then the last point (40 m).
    expect(kept.map((p) => Math.round(p.latitude * METRES_PER_DEGREE))).toEqual([
      0, 12, 24, 36, 40,
    ]);
  });

  it('always keeps the first and last point', () => {
    const points = line(5, 1);
    const kept = decimateTrack(points, 1000);
    expect(kept).toEqual([points[0], points[4]]);
  });

  it('keeps every point when they are already far apart', () => {
    const points = line(6, 50);
    expect(decimateTrack(points, 10)).toEqual(points);
  });

  it('returns short tracks unchanged', () => {
    expect(decimateTrack([], 10)).toEqual([]);
    const two = line(2, 1);
    expect(decimateTrack(two, 10)).toEqual(two);
  });

  it('does not mutate the input', () => {
    const points = line(20, 1);
    const copy = [...points];
    decimateTrack(points, 10);
    expect(points).toEqual(copy);
  });
});

import type { GPSPoint } from '@/types';
import { haversineDistanceKm } from '@/utils/geo';

/**
 * Default minimum spacing between kept points, in metres. At typical cycling speeds and 1 Hz
 * recording this drops about half of the points, with no visible change at street-level zoom.
 */
export const DEFAULT_MIN_POINT_SPACING_M = 10;

/**
 * Reduces a track for rendering. A point is kept only when it is at least `minSpacingM` metres
 * from the previously kept point. The first and last points are always kept, so the route keeps
 * its true start and end. The input is never mutated.
 */
export function decimateTrack<T extends Pick<GPSPoint, 'latitude' | 'longitude'>>(
  points: readonly T[],
  minSpacingM: number = DEFAULT_MIN_POINT_SPACING_M,
): T[] {
  const [first] = points;
  if (first === undefined || points.length <= 2 || minSpacingM <= 0) {
    return [...points];
  }

  const minSpacingKm = minSpacingM / 1000;
  const kept: T[] = [first];
  let lastKept = first;

  for (let i = 1; i < points.length - 1; i += 1) {
    const point = points[i];
    if (point && haversineDistanceKm(lastKept, point) >= minSpacingKm) {
      kept.push(point);
      lastKept = point;
    }
  }

  const last = points[points.length - 1];
  if (last) {
    kept.push(last);
  }
  return kept;
}

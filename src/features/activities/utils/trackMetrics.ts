import type { GPSPoint } from '@/types';
import { haversineDistanceKm } from '@/utils/geo';

/** Sum of great-circle distances between consecutive points, in km. */
export function trackDistanceKm(points: readonly GPSPoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const previous = points[i - 1];
    const current = points[i];
    if (previous && current) {
      total += haversineDistanceKm(previous, current);
    }
  }
  return total;
}

/**
 * Minimum climb, in metres, before it counts as elevation gain. It filters out GPS and barometric
 * noise that would otherwise inflate the total.
 */
export const ELEVATION_GAIN_THRESHOLD_M = 3;

/**
 * Elevation gain in metres, using a hysteresis threshold to suppress noise (ADR-0007 fallback when
 * the export has no value). Returns null when the track has fewer than 2 points with elevation.
 */
export function trackElevationGainM(
  points: readonly GPSPoint[],
  thresholdM: number = ELEVATION_GAIN_THRESHOLD_M,
): number | null {
  const elevations = points.flatMap((point) => (point.elevation === null ? [] : [point.elevation]));
  const [first, ...rest] = elevations;
  if (first === undefined || rest.length === 0) {
    return null;
  }

  let gain = 0;
  let reference = first;
  for (const elevation of rest) {
    if (elevation - reference >= thresholdM) {
      gain += elevation - reference;
      reference = elevation;
    } else if (reference - elevation >= thresholdM) {
      reference = elevation;
    }
  }
  return gain;
}

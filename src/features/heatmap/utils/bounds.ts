import type { CyclingActivity, GeoBounds } from '@/types';

/**
 * Smallest bounding box containing every track point of the given activities, or null when there
 * are no points. Used to fit the map view to the loaded rides.
 */
export function computeBounds(activities: readonly CyclingActivity[]): GeoBounds | null {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;

  for (const activity of activities) {
    for (const { latitude, longitude } of activity.gpsTrack) {
      if (longitude < west) west = longitude;
      if (longitude > east) east = longitude;
      if (latitude < south) south = latitude;
      if (latitude > north) north = latitude;
    }
  }

  return Number.isFinite(west) ? { west, south, east, north } : null;
}

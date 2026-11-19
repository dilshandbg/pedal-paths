import type { AnalyticsTrack, GeoBounds, GPSPoint, LocationQuery, LocationVisits } from '@/types';
import { isLinked } from '../../../services/ride-history/rideCells';
import { EARTH_RADIUS_KM } from '../../../utils/geo';
import { startedInRange } from './dateRange';

/*
 * Location visits (BR-38, RULE-24): the distinct rides whose track passed within a radius of a
 * place. A ride counts once however often it passed. The track is measured as the lines between
 * its points, except across recording gaps (`isLinked`), the same lines the location index holds
 * (ADR-0013 §5), so a ride is never counted for a place it only "jumped over".
 *
 * Only relative and type-only imports: the local backend loads this file without the `@/` alias.
 */

/** Default radius of a location visit (RULE-24). */
export const DEFAULT_VISIT_RADIUS_M = 100;

const EARTH_RADIUS_M = EARTH_RADIUS_KM * 1000;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/**
 * Bounding box of a circle around a place, for the location index lookup. It contains every
 * point within `radiusM`.
 */
export function circleBounds(latitude: number, longitude: number, radiusM: number): GeoBounds {
  const dLat = (radiusM / EARTH_RADIUS_M) * (180 / Math.PI);
  const cosLat = Math.max(Math.cos(toRadians(latitude)), 1e-6);
  const dLng = Math.min(180, dLat / cosLat);
  return {
    south: Math.max(-90, latitude - dLat),
    north: Math.min(90, latitude + dLat),
    west: Math.max(-180, longitude - dLng),
    east: Math.min(180, longitude + dLng),
  };
}

/**
 * Shortest distance in metres from a place to a track, or null for an empty track. Lines are
 * measured in a local flat projection around the place, accurate to well under a metre at
 * visit distances.
 */
export function closestApproachM(
  points: readonly GPSPoint[],
  latitude: number,
  longitude: number,
): number | null {
  const cosLat = Math.cos(toRadians(latitude));
  const project = (p: GPSPoint): [number, number] => {
    // Longitude difference wrapped to −180..180, so the antimeridian is not a jump.
    const dLng = ((((p.longitude - longitude) % 360) + 540) % 360) - 180;
    return [
      toRadians(dLng) * cosLat * EARTH_RADIUS_M,
      toRadians(p.latitude - latitude) * EARTH_RADIUS_M,
    ];
  };

  let best: number | null = null;
  points.forEach((point, i) => {
    const [bx, by] = project(point);
    let distance = Math.hypot(bx, by);
    const previous = i > 0 ? points[i - 1] : undefined;
    if (previous && isLinked(previous, point)) {
      const [ax, ay] = project(previous);
      const dx = bx - ax;
      const dy = by - ay;
      const lengthSquared = dx * dx + dy * dy;
      const t =
        lengthSquared === 0 ? 0 : Math.min(1, Math.max(0, -(ax * dx + ay * dy) / lengthSquared));
      distance = Math.min(distance, Math.hypot(ax + t * dx, ay + t * dy));
    }
    if (best === null || distance < best) best = distance;
  });
  return best;
}

/** Distinct rides in the date range that passed within the radius of the place (BR-38). */
// Implements: BR-38, RULE-24, AC-42
export function countLocationVisits(
  tracks: readonly AnalyticsTrack[],
  query: LocationQuery,
  timeZone?: string,
): LocationVisits {
  const rides: LocationVisits['rides'][number][] = [];
  const seen = new Set<string>();
  for (const track of tracks) {
    if (seen.has(track.activityId)) continue;
    if (!startedInRange(track.activityDate, query.range, timeZone)) continue;
    const closest = closestApproachM(track.points, query.latitude, query.longitude);
    if (closest === null || closest > query.radiusM) continue;
    seen.add(track.activityId);
    rides.push({
      activityId: track.activityId,
      activityName: track.activityName,
      activityDate: track.activityDate,
      closestM: Math.round(closest * 10) / 10,
    });
  }
  rides.sort(
    (a, b) =>
      a.activityDate.localeCompare(b.activityDate) || a.activityId.localeCompare(b.activityId),
  );
  return {
    latitude: query.latitude,
    longitude: query.longitude,
    radiusM: query.radiusM,
    visitCount: rides.length,
    rides,
  };
}

import type { ActivityCsvRow } from '@/services/strava-export/activitiesCsv';

/**
 * Strava activity types treated as cycling Rides (BR-03, ADR-0007). The BRD includes only `Ride`.
 * Virtual, E-Bike, Gravel and Mountain Bike rides are excluded on purpose. To include them, add
 * them here and add a test.
 */
export const RIDE_ACTIVITY_TYPES: readonly string[] = ['Ride'];

/** True when the export's activity classification is a Ride (RULE-03). Case and spacing tolerant. */
export function isRideActivityType(activityType: string): boolean {
  const normalized = activityType.trim().toLowerCase();
  return RIDE_ACTIVITY_TYPES.some((type) => type.toLowerCase() === normalized);
}

export interface ClassifiedActivities {
  readonly rides: readonly ActivityCsvRow[];
  /** Number of non-Ride activities excluded (BR-04, RULE-05). */
  readonly excludedCount: number;
}

// Implements: BR-03, BR-04
export function classifyActivities(rows: readonly ActivityCsvRow[]): ClassifiedActivities {
  const rides = rows.filter((row) => isRideActivityType(row.activityType));
  return { rides, excludedCount: rows.length - rides.length };
}

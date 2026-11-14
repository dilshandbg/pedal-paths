import type { ActivityId, CyclingActivity } from '@/types';
import { formatShortDate } from '@/utils/date';
import { formatDistanceKm, formatElevationM } from '@/utils/units';

export interface RideDescription {
  readonly activityId: ActivityId;
  readonly name: string;
  /** "Nov 5, 2023 · 2.9 km · 29 m gain"; unknown metrics are left out. */
  readonly details: string;
}

/**
 * Activity details for the ride list (BR-13): name, local date, and distance and elevation gain
 * when available (ADR-0007). Metric units.
 */
// Implements: BR-13
export function describeRide(activity: CyclingActivity, timeZone?: string): RideDescription {
  const parts = [formatShortDate(activity.activityDate, timeZone)];
  if (activity.distanceKm !== null) {
    parts.push(formatDistanceKm(activity.distanceKm));
  }
  if (activity.elevationGainM !== null) {
    parts.push(`${formatElevationM(activity.elevationGainM)} gain`);
  }
  return {
    activityId: activity.activityId,
    name: activity.activityName,
    details: parts.filter((part) => part !== '').join(' · '),
  };
}

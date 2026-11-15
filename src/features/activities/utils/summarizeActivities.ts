import type { ActivitySummary, CyclingActivity } from '@/types';

/**
 * Summary statistics for the filtered Ride activities (BR-14, BR-19, UX-08, ADR-0007): how many
 * match, their total distance, elevation gain and moving time, and the average distance per ride.
 * A ride with an unknown value is counted but left out of that value (RULE-13).
 */
// Implements: BR-14, BR-19, AC-13, AC-19, UX-08
export function summarizeActivities(activities: readonly CyclingActivity[]): ActivitySummary {
  let totalDistanceKm = 0;
  let ridesWithDistance = 0;
  let totalElevationGainM = 0;
  let totalMovingTimeS = 0;
  let ridesWithMovingTime = 0;
  for (const activity of activities) {
    if (activity.distanceKm !== null) {
      totalDistanceKm += activity.distanceKm;
      ridesWithDistance += 1;
    }
    totalElevationGainM += activity.elevationGainM ?? 0;
    if (activity.movingTimeS !== null) {
      totalMovingTimeS += activity.movingTimeS;
      ridesWithMovingTime += 1;
    }
  }
  return {
    activityCount: activities.length,
    totalDistanceKm,
    totalElevationGainM,
    totalMovingTimeS: ridesWithMovingTime === 0 ? null : totalMovingTimeS,
    averageDistanceKm: ridesWithDistance === 0 ? null : totalDistanceKm / ridesWithDistance,
  };
}

import type { ActivitySummary, CyclingActivity } from '@/types';

/**
 * Summary statistics for the filtered Ride activities (BR-14, UX-08, ADR-0007): how many match,
 * and their total distance and elevation gain. A ride with an unknown distance or elevation gain
 * is counted but left out of that total.
 */
// Implements: BR-14, AC-13, UX-08
export function summarizeActivities(activities: readonly CyclingActivity[]): ActivitySummary {
  let totalDistanceKm = 0;
  let totalElevationGainM = 0;
  for (const activity of activities) {
    totalDistanceKm += activity.distanceKm ?? 0;
    totalElevationGainM += activity.elevationGainM ?? 0;
  }
  return { activityCount: activities.length, totalDistanceKm, totalElevationGainM };
}

import type { ActivityFilter, ActivityId, CyclingActivity } from '@/types';

/**
 * Activities that contribute to the heat map under the ride filter: every ride is included unless
 * its ID is in `excludedActivityIds` (ADR-0005, AC-09). Keeps the input order. Returns the input
 * array itself when nothing is excluded, so memoized consumers see no change.
 */
// Implements: BR-09, AC-09
export function filterExcludedRides(
  activities: readonly CyclingActivity[],
  filter: ActivityFilter,
): readonly CyclingActivity[] {
  if (filter.excludedActivityIds.length === 0) {
    return activities;
  }
  const excluded = new Set(filter.excludedActivityIds);
  return activities.filter((activity) => !excluded.has(activity.activityId));
}

/**
 * New exclusion list with one ride selected (`included = true`) or deselected. Never mutates the
 * input, and returns it unchanged when the ride is already in the requested state.
 */
export function setRideIncluded(
  excludedActivityIds: readonly ActivityId[],
  activityId: ActivityId,
  included: boolean,
): readonly ActivityId[] {
  const isExcluded = excludedActivityIds.includes(activityId);
  if (included) {
    return isExcluded ? excludedActivityIds.filter((id) => id !== activityId) : excludedActivityIds;
  }
  return isExcluded ? excludedActivityIds : [...excludedActivityIds, activityId];
}

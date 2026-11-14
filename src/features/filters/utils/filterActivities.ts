import type { ActivityFilter, CyclingActivity } from '@/types';

/** Year dimension: an empty selection is unrestricted (RULE-09, ADR-0005). */
function matchesYears(activity: CyclingActivity, selectedYears: ReadonlySet<number>): boolean {
  return selectedYears.size === 0 || selectedYears.has(activity.year);
}

/**
 * Rides in scope of the year selection, before individual rides are excluded. This is what the
 * ride list offers: a ride outside the selected years never appears (ADR-0005).
 */
export function activitiesInScope(
  activities: readonly CyclingActivity[],
  filter: Pick<ActivityFilter, 'selectedYears'>,
): readonly CyclingActivity[] {
  if (filter.selectedYears.length === 0) {
    return activities;
  }
  const years = new Set(filter.selectedYears);
  return activities.filter((activity) => matchesYears(activity, years));
}

/**
 * Activities that contribute to the heat map: in a selected year (or any year when none is
 * selected) and not individually excluded (ADR-0005, AC-07, AC-09). Keeps the input order, and
 * returns the input array itself when nothing is filtered, so memoized consumers see no change.
 */
// Implements: BR-07, BR-09, AC-07, AC-09
export function filterActivities(
  activities: readonly CyclingActivity[],
  filter: ActivityFilter,
): readonly CyclingActivity[] {
  const inScope = activitiesInScope(activities, filter);
  if (filter.excludedActivityIds.length === 0) {
    return inScope;
  }
  const excluded = new Set(filter.excludedActivityIds);
  return inScope.filter((activity) => !excluded.has(activity.activityId));
}

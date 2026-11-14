import type { ActivityFilter, CyclingActivity } from '@/types';

type PeriodSelection = Pick<ActivityFilter, 'selectedYears' | 'selectedMonths'>;

/**
 * Rides in scope of the year and month selection, before individual rides are excluded. Each
 * dimension is unrestricted while empty (RULE-09), and the two combine as a Cartesian AND: years
 * {2022, 2023} with month {11} match November 2022 and November 2023 (ADR-0005, AC-10). This is
 * what the ride list offers: a ride outside the selected period never appears.
 */
export function activitiesInScope(
  activities: readonly CyclingActivity[],
  filter: PeriodSelection,
): readonly CyclingActivity[] {
  if (filter.selectedYears.length === 0 && filter.selectedMonths.length === 0) {
    return activities;
  }
  const years = new Set(filter.selectedYears);
  const months = new Set<number>(filter.selectedMonths);
  return activities.filter(
    (activity) =>
      (years.size === 0 || years.has(activity.year)) &&
      (months.size === 0 || months.has(activity.month)),
  );
}

/**
 * Activities that contribute to the heat map: in the selected period and not individually
 * excluded (ADR-0005, AC-07, AC-08, AC-09, AC-10). Keeps the input order, and returns the input
 * array itself when nothing is filtered, so memoized consumers see no change.
 */
// Implements: BR-07, BR-08, BR-09, AC-07, AC-08, AC-09, AC-10
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

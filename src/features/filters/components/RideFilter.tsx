import { useMemo } from 'react';
import { RideList, type RideOption } from '@/components/filters/RideList';
import { useActivitiesStore } from '@/features/activities/store/activitiesStore';
import { activitiesInScope } from '@/features/filters/utils/filterActivities';
import { setRideIncluded } from '@/features/filters/utils/rideFilter';
import { useFilterStore } from '@/features/filters/store/filterStore';
import type { ActivityId } from '@/types';
import { formatShortDate } from '@/utils/date';

/**
 * Connects the ride list to the loaded rides and the filter store (BR-09). Only rides in the
 * selected years are listed (ADR-0005).
 */
// Implements: BR-09
export function RideFilter() {
  const activities = useActivitiesStore((state) => state.dataset?.activities ?? null);
  const selectedYears = useFilterStore((state) => state.filter.selectedYears);
  const excludedActivityIds = useFilterStore((state) => state.filter.excludedActivityIds);
  const setFilter = useFilterStore((state) => state.setFilter);

  const rides = useMemo<readonly RideOption[]>(
    () =>
      activitiesInScope(activities ?? [], { selectedYears }).map((activity) => ({
        activityId: activity.activityId,
        name: activity.activityName,
        date: formatShortDate(activity.activityDate),
      })),
    [activities, selectedYears],
  );
  const excluded = useMemo(() => new Set(excludedActivityIds), [excludedActivityIds]);

  const onRideToggle = (activityId: ActivityId, included: boolean) => {
    setFilter({
      excludedActivityIds: setRideIncluded(
        useFilterStore.getState().filter.excludedActivityIds,
        activityId,
        included,
      ),
    });
  };

  return <RideList rides={rides} excludedActivityIds={excluded} onRideToggle={onRideToggle} />;
}

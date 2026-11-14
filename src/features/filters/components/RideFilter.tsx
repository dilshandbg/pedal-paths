import { useMemo } from 'react';
import { RideList, type RideOption } from '@/components/filters/RideList';
import { useActivitiesStore } from '@/features/activities/store/activitiesStore';
import { setRideIncluded } from '@/features/filters/utils/rideFilter';
import { useFilterStore } from '@/features/filters/store/filterStore';
import type { ActivityId } from '@/types';
import { formatShortDate } from '@/utils/date';

/** Connects the ride list to the loaded rides and the filter store (BR-09). */
// Implements: BR-09
export function RideFilter() {
  const activities = useActivitiesStore((state) => state.dataset?.activities ?? null);
  const excludedActivityIds = useFilterStore((state) => state.filter.excludedActivityIds);
  const setFilter = useFilterStore((state) => state.setFilter);

  const rides = useMemo<readonly RideOption[]>(
    () =>
      (activities ?? []).map((activity) => ({
        activityId: activity.activityId,
        name: activity.activityName,
        date: formatShortDate(activity.activityDate),
      })),
    [activities],
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

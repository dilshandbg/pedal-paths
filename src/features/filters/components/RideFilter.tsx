import { useDeferredValue, useMemo } from 'react';
import { RideList, type RideOption } from '@/components/filters/RideList';
import { useActivitiesStore } from '@/features/activities/store/activitiesStore';
import { describeRide } from '@/features/filters/utils/describeRide';
import { activitiesInScope } from '@/features/filters/utils/filterActivities';
import { setRideIncluded } from '@/features/filters/utils/rideFilter';
import { useFilterStore } from '@/features/filters/store/filterStore';
import type { ActivityId } from '@/types';

/**
 * Connects the ride list to the loaded rides and the filter store (BR-09). Only rides in the
 * selected years and months are listed (ADR-0005).
 */
// Implements: BR-09
export function RideFilter() {
  // The list renders after the map and statistics: for thousands of rides it is the slowest
  // part of showing the history, and React renders it in the background (NFR-10).
  const activities = useDeferredValue(
    useActivitiesStore((state) => state.dataset?.activities ?? null),
  );
  const selectedYears = useFilterStore((state) => state.filter.selectedYears);
  const selectedMonths = useFilterStore((state) => state.filter.selectedMonths);
  const excludedActivityIds = useFilterStore((state) => state.filter.excludedActivityIds);
  const setFilter = useFilterStore((state) => state.setFilter);

  const rides = useMemo<readonly RideOption[]>(
    () =>
      activitiesInScope(activities ?? [], { selectedYears, selectedMonths }).map((activity) =>
        describeRide(activity),
      ),
    [activities, selectedYears, selectedMonths],
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

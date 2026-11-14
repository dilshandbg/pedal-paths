import { useMemo } from 'react';
import { filterExcludedRides } from '@/features/filters/utils/rideFilter';
import { useFilterStore } from '@/features/filters/store/filterStore';
import type { CyclingActivity } from '@/types';

/** Activities that pass the current filter. Derived on demand, never stored (ADR-0005). */
export function useFilteredActivities(
  activities: readonly CyclingActivity[] | null,
): readonly CyclingActivity[] | null {
  const filter = useFilterStore((state) => state.filter);
  return useMemo(
    () => (activities ? filterExcludedRides(activities, filter) : null),
    [activities, filter],
  );
}

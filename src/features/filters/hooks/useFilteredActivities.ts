import { useMemo } from 'react';
import { filterActivities } from '@/features/filters/utils/filterActivities';
import { useFilterStore } from '@/features/filters/store/filterStore';
import type { CyclingActivity } from '@/types';

/** Activities that pass the current filter. Derived on demand, never stored (ADR-0005). */
export function useFilteredActivities(
  activities: readonly CyclingActivity[] | null,
): readonly CyclingActivity[] | null {
  const filter = useFilterStore((state) => state.filter);
  return useMemo(
    () => (activities ? filterActivities(activities, filter) : null),
    [activities, filter],
  );
}

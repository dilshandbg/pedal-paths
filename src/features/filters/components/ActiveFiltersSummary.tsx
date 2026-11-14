import { useMemo } from 'react';
import { ActiveFilters } from '@/components/filters/ActiveFilters';
import { useFilterStore } from '@/features/filters/store/filterStore';
import { describeActiveFilters } from '@/features/filters/utils/describeActiveFilters';

/** Connects the active-filters display to the filter store (BR-11, UX-06). */
export function ActiveFiltersSummary() {
  const filter = useFilterStore((state) => state.filter);
  const items = useMemo(() => describeActiveFilters(filter), [filter]);
  return <ActiveFilters items={items} />;
}

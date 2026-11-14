import { useMemo } from 'react';
import { ActiveFilters } from '@/components/filters/ActiveFilters';
import { useFilterStore } from '@/features/filters/store/filterStore';
import { describeActiveFilters } from '@/features/filters/utils/describeActiveFilters';
import { isFilterActive } from '@/features/filters/utils/isFilterActive';

/**
 * Connects the active-filters display (BR-11, UX-06) and the reset-to-all button (BR-15, UX-07)
 * to the filter store. Reset clears years, months and ride exclusions (ADR-0005, AC-14).
 */
// Implements: BR-15, AC-14
export function ActiveFiltersSummary() {
  const filter = useFilterStore((state) => state.filter);
  const resetFilter = useFilterStore((state) => state.resetFilter);
  const items = useMemo(() => describeActiveFilters(filter), [filter]);

  return <ActiveFilters items={items} canReset={isFilterActive(filter)} onReset={resetFilter} />;
}

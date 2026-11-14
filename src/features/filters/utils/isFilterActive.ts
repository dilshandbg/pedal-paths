import type { ActivityFilter } from '@/types';

/** True when any year, month or ride filter narrows the selection, i.e. a reset would change it. */
export function isFilterActive(filter: ActivityFilter): boolean {
  return (
    filter.selectedYears.length > 0 ||
    filter.selectedMonths.length > 0 ||
    filter.excludedActivityIds.length > 0
  );
}

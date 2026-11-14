import type { ActivityFilter } from '@/types';
import { monthName } from '@/utils/month';

export interface ActiveFilterItem {
  readonly label: 'Years' | 'Months' | 'Rides';
  readonly value: string;
}

/**
 * Plain-language summary of the active filters (UX-06, ADR-0005): the selected years (newest
 * first), the selected months (calendar order), and how many rides are deselected. An empty
 * dimension reads "All …" because it is unrestricted (RULE-09).
 */
// Implements: BR-11, UX-06
export function describeActiveFilters(filter: ActivityFilter): readonly ActiveFilterItem[] {
  const years = [...filter.selectedYears].sort((a, b) => b - a);
  const months = [...filter.selectedMonths].sort((a, b) => a - b);
  const excluded = new Set(filter.excludedActivityIds).size;

  return [
    { label: 'Years', value: years.length === 0 ? 'All years' : years.join(', ') },
    {
      label: 'Months',
      value: months.length === 0 ? 'All months' : months.map(monthName).join(', '),
    },
    {
      label: 'Rides',
      value:
        excluded === 0
          ? 'All rides'
          : `${excluded.toLocaleString('en-US')} ${excluded === 1 ? 'ride' : 'rides'} deselected`,
    },
  ];
}

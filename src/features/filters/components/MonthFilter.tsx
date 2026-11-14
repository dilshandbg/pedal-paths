import { useMemo } from 'react';
import { OptionChecklist, type ChecklistOption } from '@/components/filters/OptionChecklist';
import { useActivitiesStore } from '@/features/activities/store/activitiesStore';
import { useFilterStore } from '@/features/filters/store/filterStore';
import { setMonthSelected } from '@/features/filters/utils/monthFilter';
import { MONTHS, isMonth, monthName } from '@/utils/month';

const MONTH_OPTIONS: readonly ChecklistOption[] = MONTHS.map((month) => ({
  value: month,
  label: monthName(month),
}));

/**
 * Connects the month checklist, January to December, to the filter store (BR-08, ADR-0005).
 * Months combine with the selected years (AC-10).
 */
// Implements: BR-08
export function MonthFilter() {
  const hasData = useActivitiesStore((state) => state.dataset !== null);
  const selectedMonths = useFilterStore((state) => state.filter.selectedMonths);
  const setFilter = useFilterStore((state) => state.setFilter);
  const selected = useMemo(() => new Set<number>(selectedMonths), [selectedMonths]);

  return (
    <OptionChecklist
      legend="Months"
      allLabel="All months"
      options={hasData ? MONTH_OPTIONS : []}
      selected={selected}
      onOptionToggle={(month, isSelected) => {
        if (!isMonth(month)) return;
        setFilter({
          selectedMonths: setMonthSelected(
            useFilterStore.getState().filter.selectedMonths,
            month,
            isSelected,
          ),
        });
      }}
      onSelectAll={() => setFilter({ selectedMonths: [] })}
      emptyMessage="Load your Strava export to choose months."
    />
  );
}

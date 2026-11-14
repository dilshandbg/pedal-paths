import { useMemo } from 'react';
import { OptionChecklist, type ChecklistOption } from '@/components/filters/OptionChecklist';
import { useActivitiesStore } from '@/features/activities/store/activitiesStore';
import { useFilterStore } from '@/features/filters/store/filterStore';
import { availableYears, setYearSelected } from '@/features/filters/utils/yearFilter';

/** Connects the year checklist to the loaded rides and the filter store (BR-07, ADR-0005). */
// Implements: BR-07
export function YearFilter() {
  const activities = useActivitiesStore((state) => state.dataset?.activities ?? null);
  const selectedYears = useFilterStore((state) => state.filter.selectedYears);
  const setFilter = useFilterStore((state) => state.setFilter);

  const options = useMemo<readonly ChecklistOption[]>(
    () => availableYears(activities ?? []).map((year) => ({ value: year, label: String(year) })),
    [activities],
  );
  const selected = useMemo(() => new Set(selectedYears), [selectedYears]);

  return (
    <OptionChecklist
      legend="Years"
      allLabel="All years"
      options={options}
      selected={selected}
      onOptionToggle={(year, isSelected) =>
        setFilter({
          selectedYears: setYearSelected(
            useFilterStore.getState().filter.selectedYears,
            year,
            isSelected,
          ),
        })
      }
      onSelectAll={() => setFilter({ selectedYears: [] })}
      emptyMessage="Load your Strava export to choose years."
    />
  );
}

import { APP_TITLE } from '@/app/config';
import { FilterPanel } from '@/components/filters/FilterPanel';
import { AppHeader } from '@/components/layout/AppHeader';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { StatisticsPanel } from '@/components/statistics/StatisticsPanel';
import { ArchiveUploadPanel } from '@/features/activities/components/ArchiveUploadPanel';
import { useActivitiesStore } from '@/features/activities/store/activitiesStore';
import { ActiveFiltersSummary } from '@/features/filters/components/ActiveFiltersSummary';
import { MonthFilter } from '@/features/filters/components/MonthFilter';
import { RideFilter } from '@/features/filters/components/RideFilter';
import { YearFilter } from '@/features/filters/components/YearFilter';
import { useFilteredActivities } from '@/features/filters/hooks/useFilteredActivities';
import { useFilterStore } from '@/features/filters/store/filterStore';
import { HeatMapView } from '@/features/heatmap/components/HeatMapView';

/**
 * The single dashboard screen and the composition root that wires features together.
 * Placeholder panels are replaced as features are built.
 */
export function DashboardRoute() {
  const resetFilter = useFilterStore((state) => state.resetFilter);
  const activities = useActivitiesStore((state) => state.dataset?.activities ?? null);
  const segmentIndex = useActivitiesStore((state) => state.dataset?.segmentIndex ?? null);
  const selectedActivities = useFilteredActivities(activities);

  return (
    <DashboardLayout
      header={<AppHeader title={APP_TITLE} />}
      filters={
        <div className="flex flex-col gap-4">
          {/* A new dataset invalidates the previous filter selection (ADR-0005, AC-15). */}
          <ArchiveUploadPanel onDatasetReplaced={resetFilter} />
          <FilterPanel
            summary={<ActiveFiltersSummary />}
            years={<YearFilter />}
            months={<MonthFilter />}
            rides={<RideFilter />}
          />
        </div>
      }
      map={
        <HeatMapView
          activities={activities}
          selectedActivities={selectedActivities}
          segmentIndex={segmentIndex}
        />
      }
      statistics={<StatisticsPanel />}
    />
  );
}

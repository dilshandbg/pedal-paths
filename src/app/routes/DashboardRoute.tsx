import { APP_TITLE } from '@/app/config';
import { FilterPanel } from '@/components/filters/FilterPanel';
import { AppHeader } from '@/components/layout/AppHeader';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { MapView } from '@/components/map/MapView';
import { StatisticsPanel } from '@/components/statistics/StatisticsPanel';
import { ArchiveUploadPanel } from '@/features/activities/components/ArchiveUploadPanel';
import { useActivitiesStore } from '@/features/activities/store/activitiesStore';
import { useFilterStore } from '@/features/filters/store/filterStore';

/**
 * The single dashboard screen and the composition root that wires features together.
 * Placeholder panels are replaced as features are built.
 */
export function DashboardRoute() {
  const resetFilter = useFilterStore((state) => state.resetFilter);
  const loadedRideCount = useActivitiesStore((state) => state.dataset?.activities.length ?? null);

  return (
    <DashboardLayout
      header={<AppHeader title={APP_TITLE} />}
      filters={
        <div className="flex flex-col gap-4">
          {/* A new dataset invalidates the previous filter selection (ADR-0005, AC-15). */}
          <ArchiveUploadPanel onDatasetReplaced={resetFilter} />
          <FilterPanel />
        </div>
      }
      map={<MapView loadedRideCount={loadedRideCount} />}
      statistics={<StatisticsPanel />}
    />
  );
}

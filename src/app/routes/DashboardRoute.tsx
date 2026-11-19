import { useEffect, useState } from 'react';
import { APP_TITLE } from '@/app/config';
import { Tabs } from '@/components/common/Tabs';
import { FilterPanel } from '@/components/filters/FilterPanel';
import { AppHeader } from '@/components/layout/AppHeader';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { ActivityStatistics } from '@/features/activities/components/ActivityStatistics';
import { ArchiveUploadPanel } from '@/features/activities/components/ArchiveUploadPanel';
import { UploadsSection } from '@/features/activities/components/UploadsSection';
import { useActivitiesStore } from '@/features/activities/store/activitiesStore';
import { ActiveFiltersSummary } from '@/features/filters/components/ActiveFiltersSummary';
import { MonthFilter } from '@/features/filters/components/MonthFilter';
import { RideFilter } from '@/features/filters/components/RideFilter';
import { YearFilter } from '@/features/filters/components/YearFilter';
import { useFilteredActivities } from '@/features/filters/hooks/useFilteredActivities';
import { useFilterStore } from '@/features/filters/store/filterStore';
import { withoutRemovedRides } from '@/features/filters/utils/rideFilter';
import { HeatMapView } from '@/features/heatmap/components/HeatMapView';
import { SegmentsSection } from '@/features/segments/components/SegmentsSection';
import { useSegmentOverlay } from '@/features/segments/hooks/useSegmentOverlay';

/**
 * The single dashboard screen and the composition root that wires features together.
 * Placeholder panels are replaced as features are built.
 */
export function DashboardRoute() {
  const loadHistory = useActivitiesStore((state) => state.loadHistory);
  const activities = useActivitiesStore((state) => state.dataset?.activities ?? null);
  const segmentIndex = useActivitiesStore((state) => state.dataset?.segmentIndex ?? null);
  const dataBounds = useActivitiesStore((state) => state.dataset?.bounds ?? null);
  const selectedActivities = useFilteredActivities(activities);
  const segmentMap = useSegmentOverlay();
  const [sidebarTab, setSidebarTab] = useState<'rides' | 'segments' | 'uploads'>('rides');

  // Show the stored ride history when the app starts (BR-33, AC-34).
  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  // Rides whose upload was deleted leave the ride filter too (BR-36, ADR-0013 §4).
  useEffect(() => {
    const { filter, setFilter } = useFilterStore.getState();
    const existing = new Set((activities ?? []).map((activity) => activity.activityId));
    const kept = withoutRemovedRides(filter.excludedActivityIds, existing);
    if (kept !== filter.excludedActivityIds) setFilter({ excludedActivityIds: kept });
  }, [activities]);

  return (
    <DashboardLayout
      header={<AppHeader title={APP_TITLE} />}
      filters={
        <Tabs
          label="Sidebar"
          selected={sidebarTab}
          onSelect={setSidebarTab}
          tabs={[
            {
              key: 'rides',
              label: 'Rides',
              content: (
                <div className="flex flex-col gap-4">
                  {/* Filters are kept when an upload adds rides (ADR-0013 §4). */}
                  <ArchiveUploadPanel />
                  <FilterPanel
                    summary={<ActiveFiltersSummary />}
                    years={<YearFilter />}
                    months={<MonthFilter />}
                    rides={<RideFilter />}
                  />
                </div>
              ),
            },
            { key: 'segments', label: 'Segments', content: <SegmentsSection /> },
            { key: 'uploads', label: 'Uploads', content: <UploadsSection /> },
          ]}
        />
      }
      map={
        <HeatMapView
          bounds={dataBounds}
          selectedActivities={selectedActivities}
          segmentIndex={segmentIndex}
          segmentOverlay={segmentMap.overlay}
          focusBounds={segmentMap.focusBounds}
          onSegmentSelect={(segmentId) => {
            setSidebarTab('segments'); // show the selected segment's details (AC-27)
            segmentMap.selectSegment(segmentId);
          }}
        />
      }
      statistics={<ActivityStatistics activities={selectedActivities} />}
    />
  );
}

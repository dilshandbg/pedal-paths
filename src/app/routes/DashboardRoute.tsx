import { APP_TITLE } from '@/app/config';
import { FilterPanel } from '@/components/filters/FilterPanel';
import { AppHeader } from '@/components/layout/AppHeader';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { MapView } from '@/components/map/MapView';
import { StatisticsPanel } from '@/components/statistics/StatisticsPanel';

/**
 * The single dashboard screen. It wires the shell together; feature containers will replace
 * the placeholder panels as features are built.
 */
export function DashboardRoute() {
  return (
    <DashboardLayout
      header={<AppHeader title={APP_TITLE} />}
      filters={<FilterPanel />}
      map={<MapView />}
      statistics={<StatisticsPanel />}
    />
  );
}

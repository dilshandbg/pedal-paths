import { Panel } from '@/components/common/Panel';
import { PlaceholderNotice } from '@/components/common/PlaceholderNotice';

/** Placeholder for the statistics panel. Which metrics to show is pending the BRD (OD-09). */
export function StatisticsPanel() {
  return (
    <Panel title="Statistics" description="Summary of the selected activities.">
      <PlaceholderNotice>Statistics will appear here once activities are loaded.</PlaceholderNotice>
    </Panel>
  );
}

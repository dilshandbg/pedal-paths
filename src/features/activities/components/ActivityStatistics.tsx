import { useMemo } from 'react';
import { StatisticsPanel } from '@/components/statistics/StatisticsPanel';
import { describeSummary } from '@/features/activities/utils/describeSummary';
import { summarizeActivities } from '@/features/activities/utils/summarizeActivities';
import type { CyclingActivity } from '@/types';

interface ActivityStatisticsProps {
  /** Activities matching the active filters, or null when no export is loaded. */
  activities: readonly CyclingActivity[] | null;
}

/** Derives the summary statistics of the filtered rides and shows them (BR-14, AC-13, UX-08). */
export function ActivityStatistics({ activities }: ActivityStatisticsProps) {
  const items = useMemo(
    () => (activities ? describeSummary(summarizeActivities(activities)) : null),
    [activities],
  );
  return <StatisticsPanel items={items} />;
}

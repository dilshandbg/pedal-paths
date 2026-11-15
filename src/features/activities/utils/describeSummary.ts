import { pluralize } from '@/features/activities/utils/importMessages';
import type { ActivitySummary } from '@/types';
import { formatDistanceKm, formatDuration, formatElevationM } from '@/utils/units';

export interface SummaryItem {
  readonly label: 'Rides' | 'Distance' | 'Elevation gain' | 'Moving time' | 'Average distance';
  readonly value: string;
}

/** Shown when no filtered ride has the value (RULE-13). */
export const NOT_AVAILABLE = 'Not available';

/**
 * Display text for the summary statistics (BR-19, UX-08, ADR-0007, metric units): "3 rides",
 * "1,234.5 km", "12,345 m", "41 h 05 min", "28.4 km".
 */
export function describeSummary(summary: ActivitySummary): readonly SummaryItem[] {
  return [
    { label: 'Rides', value: pluralize(summary.activityCount, 'ride') },
    { label: 'Distance', value: formatDistanceKm(summary.totalDistanceKm) },
    { label: 'Elevation gain', value: formatElevationM(summary.totalElevationGainM) },
    {
      label: 'Moving time',
      value:
        summary.totalMovingTimeS === null
          ? NOT_AVAILABLE
          : formatDuration(summary.totalMovingTimeS),
    },
    {
      label: 'Average distance',
      value:
        summary.averageDistanceKm === null
          ? NOT_AVAILABLE
          : formatDistanceKm(summary.averageDistanceKm),
    },
  ];
}

import { pluralize } from '@/features/activities/utils/importMessages';
import type { ActivitySummary } from '@/types';
import { formatDistanceKm, formatElevationM } from '@/utils/units';

export interface SummaryItem {
  readonly label: 'Rides' | 'Distance' | 'Elevation gain';
  readonly value: string;
}

/**
 * Display text for the summary statistics (UX-08, ADR-0007, metric units): "3 rides",
 * "1,234.5 km", "12,345 m".
 */
export function describeSummary(summary: ActivitySummary): readonly SummaryItem[] {
  return [
    { label: 'Rides', value: pluralize(summary.activityCount, 'ride') },
    { label: 'Distance', value: formatDistanceKm(summary.totalDistanceKm) },
    { label: 'Elevation gain', value: formatElevationM(summary.totalElevationGainM) },
  ];
}

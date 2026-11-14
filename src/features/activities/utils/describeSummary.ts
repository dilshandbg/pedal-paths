import { pluralize } from '@/features/activities/utils/importMessages';
import type { ActivitySummary } from '@/types';

export interface SummaryItem {
  readonly label: 'Rides' | 'Distance' | 'Elevation gain';
  readonly value: string;
}

const KM = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const METRES = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/**
 * Display text for the summary statistics (UX-08, ADR-0007, metric units): "3 rides",
 * "1,234.5 km", "12,345 m".
 */
export function describeSummary(summary: ActivitySummary): readonly SummaryItem[] {
  return [
    { label: 'Rides', value: pluralize(summary.activityCount, 'ride') },
    { label: 'Distance', value: `${KM.format(summary.totalDistanceKm)} km` },
    { label: 'Elevation gain', value: `${METRES.format(summary.totalElevationGainM)} m` },
  ];
}

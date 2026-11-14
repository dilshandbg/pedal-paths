import { Suspense, lazy, useMemo } from 'react';
import { aggregateHeatMap } from '@/features/heatmap/services/aggregateHeatMap';
import { computeBounds } from '@/features/heatmap/utils/bounds';
import { getMapStyleUrl } from '@/services/map';
import type { CyclingActivity, SegmentIndex } from '@/types';

// MapLibre + deck.gl are large; load them in their own chunk so the rest of the dashboard
// (header, upload panel, filters) renders immediately.
const MapView = lazy(() =>
  import('@/components/map/MapView').then((module) => ({ default: module.MapView })),
);

interface HeatMapViewProps {
  /** Activities to include in the heat map, or null when no export is loaded. */
  activities: readonly CyclingActivity[] | null;
  /** Segment index of the loaded dataset (ADR-0006), or null when no export is loaded. */
  segmentIndex: SegmentIndex | null;
}

/**
 * Aggregates traversal frequency for the given activities with pure functions and hands the
 * result to the map (BR-12). Re-aggregation only happens when the activities or the index change.
 * The view is refitted only when a new dataset (index) arrives.
 */
export function HeatMapView({ activities, segmentIndex }: HeatMapViewProps) {
  const data = useMemo(
    () =>
      activities && segmentIndex
        ? aggregateHeatMap(
            segmentIndex,
            activities.map((activity) => activity.activityId),
          )
        : null,
    [activities, segmentIndex],
  );
  const bounds = useMemo(() => (activities ? computeBounds(activities) : null), [activities]);

  return (
    <Suspense fallback={<MapLoading />}>
      <MapView styleUrl={getMapStyleUrl()} data={data} fitBounds={bounds} />
    </Suspense>
  );
}

function MapLoading() {
  return (
    <section
      aria-label="Ride map"
      aria-busy="true"
      className="map-placeholder-grid flex h-full min-h-[inherit] items-center justify-center rounded-xl border border-slate-200 shadow-sm"
    >
      <p className="rounded-lg bg-white/90 px-4 py-3 text-sm text-slate-600 shadow-sm">
        Loading map…
      </p>
    </section>
  );
}

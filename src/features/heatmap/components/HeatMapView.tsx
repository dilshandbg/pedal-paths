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
  /** All loaded activities (the view is fitted to them), or null when no export is loaded. */
  activities: readonly CyclingActivity[] | null;
  /** Activities that pass the filters and contribute to the heat map (BR-09). */
  selectedActivities: readonly CyclingActivity[] | null;
  /** Segment index of the loaded dataset (ADR-0006), or null when no export is loaded. */
  segmentIndex: SegmentIndex | null;
}

/**
 * Aggregates traversal frequency for the selected activities with pure functions and hands the
 * result to the map (BR-12). A new selection only replaces the deck.gl layer on the existing map:
 * the map is never recreated and the page never reloads (BR-10). Re-aggregation happens when the selection or the index changes. The
 * view is fitted to all loaded activities, so it only moves when a new dataset arrives, not on
 * every filter change.
 */
export function HeatMapView({ activities, selectedActivities, segmentIndex }: HeatMapViewProps) {
  const data = useMemo(
    () =>
      selectedActivities && segmentIndex
        ? aggregateHeatMap(
            segmentIndex,
            selectedActivities.map((activity) => activity.activityId),
          )
        : null,
    [selectedActivities, segmentIndex],
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

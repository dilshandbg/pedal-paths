import { Suspense, lazy, useMemo } from 'react';
import { buildRoutePaths } from '@/features/heatmap/services/buildRoutePaths';
import { computeBounds } from '@/features/heatmap/utils/bounds';
import { getMapStyleUrl } from '@/services/map';
import type { CyclingActivity } from '@/types';

// MapLibre + deck.gl are large; load them in their own chunk so the rest of the dashboard
// (header, upload panel, filters) renders immediately.
const MapView = lazy(() =>
  import('@/components/map/MapView').then((module) => ({ default: module.MapView })),
);

interface HeatMapViewProps {
  /** Activities to draw, or null when no export is loaded. */
  activities: readonly CyclingActivity[] | null;
}

/**
 * Prepares render data from activities with pure functions and hands it to the map. Data and bounds
 * are recomputed only when the activities change, so a new dataset refits the view (AC-15).
 */
export function HeatMapView({ activities }: HeatMapViewProps) {
  const data = useMemo(() => (activities ? buildRoutePaths(activities) : null), [activities]);
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

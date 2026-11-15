import { Suspense, lazy, useMemo } from 'react';
import { aggregateHeatMap } from '@/features/heatmap/services/aggregateHeatMap';
import { buildHeatMapGeometry } from '@/features/heatmap/services/buildHeatMapGeometry';
import { computeBounds } from '@/features/heatmap/utils/bounds';
import { HEAT_PALETTE_OPTIONS } from '@/components/map/heatStyle';
import { MapOptionSelect } from '@/components/map/MapOptionSelect';
import { useMapStyleStore } from '@/features/heatmap/store/mapStyleStore';
import { resolveChoice } from '@/features/heatmap/utils/baseMap';
import { getBaseMapOptions } from '@/services/map';
import type { CyclingActivity, GeoBounds, SegmentIndex, SegmentOverlayData } from '@/types';

// MapLibre + deck.gl are large; load them in their own chunk so the rest of the dashboard
// (header, upload panel, filters) renders immediately.
/** Base maps on offer; fixed for the session (they depend only on build-time configuration). */
const BASE_MAP_OPTIONS = getBaseMapOptions();

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
  /** Imported segment routes to draw above the heat map (BR-26); passed through unchanged. */
  segmentOverlay?: SegmentOverlayData | null;
  onSegmentSelect?: (segmentId: string) => void;
  /** Bounds to bring into view, e.g. of a selected segment. */
  focusBounds?: GeoBounds | null;
}

/**
 * Aggregates traversal frequency for the selected activities with pure functions and hands the
 * result to the map (BR-12). A new selection only replaces the deck.gl layer on the existing map:
 * the map is never recreated and the page never reloads (BR-10). Re-aggregation happens when the selection or the index changes. The
 * view is fitted to all loaded activities, so it only moves when a new dataset arrives, not on
 * every filter change. The user picks the base map style, and the heat map colours follow its
 * theme (BR-32).
 */
export function HeatMapView({
  activities,
  selectedActivities,
  segmentIndex,
  segmentOverlay = null,
  onSegmentSelect,
  focusBounds = null,
}: HeatMapViewProps) {
  // Built once per loaded export; every filter change reuses it (NFR-02).
  const geometry = useMemo(
    () => (segmentIndex ? buildHeatMapGeometry(segmentIndex) : null),
    [segmentIndex],
  );
  const data = useMemo(
    () =>
      selectedActivities && segmentIndex && geometry
        ? aggregateHeatMap(
            segmentIndex,
            geometry,
            selectedActivities.map((activity) => activity.activityId),
          )
        : null,
    [selectedActivities, segmentIndex, geometry],
  );
  const bounds = useMemo(() => (activities ? computeBounds(activities) : null), [activities]);
  const baseMapId = useMapStyleStore((state) => state.baseMapId);
  const setBaseMap = useMapStyleStore((state) => state.setBaseMap);
  const heatPaletteId = useMapStyleStore((state) => state.heatPaletteId);
  const setHeatPalette = useMapStyleStore((state) => state.setHeatPalette);
  // Both option lists include their default, so neither result is null.
  const baseMap = resolveChoice(BASE_MAP_OPTIONS, baseMapId) as (typeof BASE_MAP_OPTIONS)[number];
  const heatPalette = resolveChoice(
    HEAT_PALETTE_OPTIONS,
    heatPaletteId,
  ) as (typeof HEAT_PALETTE_OPTIONS)[number];

  return (
    <div className="relative h-full min-h-[inherit]">
      <Suspense fallback={<MapLoading />}>
        <MapView
          styleUrl={baseMap.url}
          baseMapTheme={baseMap.theme}
          heatPalette={heatPalette.id}
          data={data}
          fitBounds={bounds}
          segmentOverlay={segmentOverlay}
          focusBounds={focusBounds}
          {...(onSegmentSelect ? { onSegmentSelect } : {})}
        />
      </Suspense>
      <div
        role="group"
        aria-label="Map display"
        className="absolute top-3 left-3 z-10 flex flex-col gap-1.5 rounded-lg bg-white/90 px-3 py-2 shadow-sm backdrop-blur"
      >
        <MapOptionSelect
          label="Map style"
          options={BASE_MAP_OPTIONS}
          selectedId={baseMap.id}
          onSelect={setBaseMap}
        />
        <MapOptionSelect
          label="Heat colours"
          options={HEAT_PALETTE_OPTIONS}
          selectedId={heatPalette.id}
          onSelect={setHeatPalette}
        />
      </div>
    </div>
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

interface MapViewProps {
  /** Number of loaded rides, or null when no export has been loaded yet. */
  loadedRideCount: number | null;
}

/**
 * Placeholder for the map. The MapLibre map and deck.gl overlay will be built here or in
 * `features/heatmap/components` (ADR-0008). This component must only take render-ready data,
 * never compute it.
 */
export function MapView({ loadedRideCount }: MapViewProps) {
  return (
    <section
      aria-label="Map"
      className="map-placeholder-grid relative flex h-full min-h-[inherit] items-center justify-center overflow-hidden rounded-xl border border-slate-200 shadow-sm"
    >
      <div className="mx-4 max-w-sm rounded-lg bg-white/90 p-5 text-center shadow-sm backdrop-blur">
        <p className="text-sm font-semibold text-slate-800">Heat map</p>
        <p className="mt-1 text-sm text-slate-500">
          {loadedRideCount === null
            ? 'The map will appear here once a Strava export ZIP has been loaded.'
            : `${loadedRideCount.toLocaleString('en-US')} rides loaded. Map rendering is the next feature.`}
        </p>
      </div>
    </section>
  );
}

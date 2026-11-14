import { MapboxOverlay } from '@deck.gl/mapbox';
import { Map as MapLibreMap, NavigationControl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef, useState } from 'react';
import {
  FIT_BOUNDS_MAX_ZOOM,
  FIT_BOUNDS_PADDING_PX,
  INITIAL_VIEW,
} from '@/components/map/mapConfig';
import { HeatLegend } from '@/components/map/HeatLegend';
import { createRouteLayer } from '@/components/map/routeLayer';
import { setupMapLibre } from '@/services/map/setupMapLibre';
import type { GeoBounds, HeatMapData } from '@/types';

setupMapLibre();

interface MapViewProps {
  /** MapLibre style URL for the base map (ADR-0008). */
  styleUrl: string;
  /** Render-ready routes, or null when no rides are loaded. */
  data: HeatMapData | null;
  /** When this changes, the view is fitted to these bounds (e.g. a new dataset was loaded). */
  fitBounds: GeoBounds | null;
}

/**
 * Interactive base map (MapLibre, pan and zoom) with the routes drawn on top by deck.gl (BR-06).
 * It only renders the prepared `data`; it never filters or aggregates.
 */
// Implements: BR-06
export function MapView({ styleUrl, data, fitBounds }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const [mapError, setMapError] = useState(false);

  // Create the map once per style URL.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    let map: MapLibreMap;
    try {
      map = new MapLibreMap({
        container,
        style: styleUrl,
        center: INITIAL_VIEW.center,
        zoom: INITIAL_VIEW.zoom,
        attributionControl: { compact: true },
      });
    } catch {
      // Typically: WebGL is unavailable or disabled in this browser.
      setMapError(true);
      return;
    }

    const overlay = new MapboxOverlay({ interleaved: false, layers: [] });
    map.addControl(new NavigationControl({ visualizePitch: false }), 'top-right');
    map.addControl(overlay);
    mapRef.current = map;
    overlayRef.current = overlay;

    return () => {
      map.remove(); // also removes the overlay control
      mapRef.current = null;
      overlayRef.current = null;
    };
  }, [styleUrl]);

  // Redraw routes whenever the prepared data changes.
  useEffect(() => {
    overlayRef.current?.setProps({ layers: data ? [createRouteLayer(data)] : [] });
  }, [data]);

  // Fit the view when new bounds arrive.
  useEffect(() => {
    if (fitBounds && mapRef.current) {
      mapRef.current.fitBounds(
        [
          [fitBounds.west, fitBounds.south],
          [fitBounds.east, fitBounds.north],
        ],
        { padding: FIT_BOUNDS_PADDING_PX, maxZoom: FIT_BOUNDS_MAX_ZOOM, duration: 600 },
      );
    }
  }, [fitBounds]);

  const rideCount = data?.activityIds.length ?? 0;

  return (
    <section
      aria-label="Ride map"
      className="map-placeholder-grid relative h-full min-h-[inherit] overflow-hidden rounded-xl border border-slate-200 shadow-sm"
    >
      {/* MapLibre sets `position: relative` on its container, so position a wrapper instead. */}
      <div className="absolute inset-0">
        <div ref={containerRef} className="h-full w-full" />
      </div>

      {mapError ? (
        <MapNotice role="alert">
          The map could not be started. Your browser may have WebGL turned off or unsupported.
        </MapNotice>
      ) : data === null ? (
        <MapNotice>Load your Strava export ZIP to see your rides on the map.</MapNotice>
      ) : null}

      {data !== null && data.maxFrequency > 0 ? (
        <HeatLegend maxFrequency={data.maxFrequency} />
      ) : null}

      <p role="status" className="sr-only">
        {data === null
          ? 'No rides loaded'
          : `Showing ${rideCount.toLocaleString('en-US')} ${rideCount === 1 ? 'ride' : 'rides'} on the map`}
      </p>
    </section>
  );
}

function MapNotice({ children, role }: { children: string; role?: 'alert' }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-4 flex justify-center px-4">
      <p
        role={role}
        className="max-w-sm rounded-lg bg-white/90 px-4 py-3 text-center text-sm text-slate-600 shadow-sm backdrop-blur"
      >
        {children}
      </p>
    </div>
  );
}

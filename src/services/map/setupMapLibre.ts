import { setWorkerUrl } from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';

/**
 * MapLibre computes its worker URL from its own module location at runtime. Vite cannot see that
 * reference, so after bundling (and in the dev server's pre-bundled deps) the URL points to a file
 * that doesn't exist and tiles never render. Shipping the self-contained worker as an asset and
 * registering its URL fixes both builds. Import this module once before creating a map.
 */
let configured = false;

export function setupMapLibre(): void {
  if (!configured) {
    setWorkerUrl(maplibreWorkerUrl);
    configured = true;
  }
}

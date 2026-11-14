import { PathLayer } from '@deck.gl/layers';
import type { HeatMapData, HeatMapPath } from '@/types';

/** Route colour (orange-600, translucent so overlapping rides read darker). RGBA 0–255. */
export const ROUTE_COLOR: [number, number, number, number] = [234, 88, 12, 150];
export const ROUTE_WIDTH_PX = 2.5;
export const ROUTE_LAYER_ID = 'ride-routes';

/**
 * deck.gl layer that draws prepared `HeatMapData`. It only renders: all geometry and frequency
 * work happens beforehand in `features/heatmap/services` (CLAUDE.md, ADR-0006).
 */
export function createRouteLayer(data: HeatMapData): PathLayer<HeatMapPath> {
  return new PathLayer<HeatMapPath>({
    id: ROUTE_LAYER_ID,
    data: [...data.paths],
    getPath: (path) =>
      path.coordinates.map(([longitude, latitude]): [number, number] => [longitude, latitude]),
    getColor: ROUTE_COLOR,
    getWidth: ROUTE_WIDTH_PX,
    widthUnits: 'pixels',
    widthMinPixels: 1.5,
    capRounded: true,
    jointRounded: true,
    pickable: false,
  });
}

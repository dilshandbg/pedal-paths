import { PathLayer } from '@deck.gl/layers';
import { heatColor, heatWidth } from '@/components/map/heatStyle';
import type { HeatMapData, HeatMapPath } from '@/types';

export const ROUTE_LAYER_ID = 'ride-heat';

/**
 * deck.gl layer that draws prepared `HeatMapData`, coloured and sized by intensity (BR-12). It only
 * renders: all geometry and frequency work happens beforehand in `features/heatmap/services`.
 */
export function createRouteLayer(data: HeatMapData): PathLayer<HeatMapPath> {
  return new PathLayer<HeatMapPath>({
    id: ROUTE_LAYER_ID,
    data: [...data.paths],
    // deck.gl only reads positions. Pass the existing tuples instead of copying ~1M arrays; the
    // cast drops `readonly` only.
    getPath: (path) => path.coordinates as [number, number][],
    getColor: (path) => heatColor(path.intensity),
    getWidth: (path) => heatWidth(path.intensity),
    widthUnits: 'pixels',
    capRounded: true,
    jointRounded: true,
    pickable: false,
  });
}

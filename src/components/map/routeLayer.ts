import type { Layer } from '@deck.gl/core';
import { LineLayer, ScatterplotLayer } from '@deck.gl/layers';
import { heatColor, heatWidth } from '@/components/map/heatStyle';
import type { BaseMapTheme, HeatMapData, HeatPaletteId } from '@/types';

export const ROUTE_LAYER_ID = 'ride-heat';
export const SEGMENT_LAYER_ID = `${ROUTE_LAYER_ID}-segments`;
export const JOINT_LAYER_ID = `${ROUTE_LAYER_ID}-joints`;

/** Colour (RGBA) and width (px) per frequency value: computed once per data set, not per segment. */
function styleByFrequency(
  data: HeatMapData,
  theme: BaseMapTheme,
  palette: HeatPaletteId | undefined,
): { colors: Uint8Array; widths: Float32Array } {
  const count = data.intensityByFrequency.length;
  const colors = new Uint8Array(count * 4);
  const widths = new Float32Array(count);
  for (let f = 1; f < count; f += 1) {
    const intensity = data.intensityByFrequency[f] ?? 0;
    colors.set(heatColor(intensity, theme, palette), f * 4);
    widths[f] = heatWidth(intensity);
  }
  return { colors, widths }; // frequency 0: transparent, zero width (not drawn)
}

/** Fills per-item colour and size buffers from a frequency array via the per-frequency style. */
function fillStyle(
  frequency: Uint32Array,
  style: { colors: Uint8Array; widths: Float32Array },
  sizeScale: number,
): { colors: Uint8Array; sizes: Float32Array } {
  const colors = new Uint8Array(frequency.length * 4);
  const sizes = new Float32Array(frequency.length);
  for (let k = 0; k < frequency.length; k += 1) {
    const f = frequency[k] ?? 0;
    if (f === 0) continue;
    colors[k * 4] = style.colors[f * 4] ?? 0;
    colors[k * 4 + 1] = style.colors[f * 4 + 1] ?? 0;
    colors[k * 4 + 2] = style.colors[f * 4 + 2] ?? 0;
    colors[k * 4 + 3] = style.colors[f * 4 + 3] ?? 0;
    sizes[k] = (style.widths[f] ?? 0) * sizeScale;
  }
  return { colors, sizes };
}

/**
 * deck.gl layers that draw prepared `HeatMapData`, coloured and sized by intensity (BR-12). They
 * only render: frequencies are computed beforehand in `features/heatmap/services`. The colour ramp
 * is the chosen `palette`, adjusted to the base map's `theme` (BR-32, OD-27).
 *
 * Every road segment is one instanced line, and every cell a dot of the busiest meeting segment's
 * colour, which gives round, seamless joints. Positions are the dataset's shared geometry buffers,
 * so a filter change only uploads new colours and sizes (NFR-02, ADR-0006).
 */
export function createRouteLayers(
  data: HeatMapData,
  theme: BaseMapTheme = 'light',
  palette?: HeatPaletteId,
): Layer[] {
  const style = styleByFrequency(data, theme, palette);
  const segments = fillStyle(data.segmentFrequency, style, 1);
  const joints = fillStyle(data.cellFrequency, style, 0.5); // radius = half the line width
  const { geometry } = data;

  return [
    new LineLayer({
      id: SEGMENT_LAYER_ID,
      data: {
        length: geometry.segmentCount,
        attributes: {
          getSourcePosition: { value: geometry.segmentSources, size: 2 },
          getTargetPosition: { value: geometry.segmentTargets, size: 2 },
          getColor: { value: segments.colors, size: 4, normalized: true },
          getWidth: { value: segments.sizes, size: 1 },
        },
      },
      widthUnits: 'pixels',
      pickable: false,
    }),
    new ScatterplotLayer({
      id: JOINT_LAYER_ID,
      data: {
        length: geometry.cellCount,
        attributes: {
          getPosition: { value: geometry.cellPositions, size: 2 },
          getFillColor: { value: joints.colors, size: 4, normalized: true },
          getRadius: { value: joints.sizes, size: 1 },
        },
      },
      radiusUnits: 'pixels',
      stroked: false,
      pickable: false,
    }),
  ];
}

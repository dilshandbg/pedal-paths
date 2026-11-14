/**
 * Visual encoding of heat map intensity (0..1, BR-12). Colour runs from light orange (ridden once)
 * to deep red (most ridden), with luminance falling as intensity rises. Width grows too, so
 * frequency is never shown by colour alone. Colours are opaque: segment lines and joint dots
 * overlap, and transparency would show darker spots at every joint.
 */
export const HEAT_COLOR_STOPS: readonly (readonly [number, number, number])[] = [
  [254, 178, 76],
  [253, 141, 60],
  [240, 59, 32],
  [189, 0, 38],
];

export const HEAT_MIN_WIDTH_PX = 2;
export const HEAT_MAX_WIDTH_PX = 6;
const OPAQUE = 255;

const clamp01 = (value: number) => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** RGBA colour for an intensity, interpolated between the stops. */
export function heatColor(intensity: number): [number, number, number, number] {
  const t = clamp01(intensity);
  const scaled = t * (HEAT_COLOR_STOPS.length - 1);
  const index = Math.min(Math.floor(scaled), HEAT_COLOR_STOPS.length - 2);
  const from = HEAT_COLOR_STOPS[index] ?? HEAT_COLOR_STOPS[0] ?? [0, 0, 0];
  const to = HEAT_COLOR_STOPS[index + 1] ?? from;
  const local = scaled - index;
  return [
    Math.round(lerp(from[0], to[0], local)),
    Math.round(lerp(from[1], to[1], local)),
    Math.round(lerp(from[2], to[2], local)),
    OPAQUE,
  ];
}

/** Line width in pixels for an intensity. */
export function heatWidth(intensity: number): number {
  return lerp(HEAT_MIN_WIDTH_PX, HEAT_MAX_WIDTH_PX, clamp01(intensity));
}

/** CSS gradient matching the colour ramp, for the legend. */
export const HEAT_LEGEND_GRADIENT = `linear-gradient(to right, ${HEAT_COLOR_STOPS.map(
  ([r, g, b]) => `rgb(${r} ${g} ${b})`,
).join(', ')})`;

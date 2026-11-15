import type { BaseMapTheme } from '@/types';

/**
 * Visual encoding of heat map intensity (0..1, BR-12). A magenta–purple ramp (BR-32): these hues
 * are not used by the base maps (whose roads are yellow and orange) or by the blue segment
 * overlay, so ridden roads stand out. On a light base map the colour gets darker as intensity
 * rises; on a dark base map it gets lighter, so the busiest roads always have the most contrast.
 * Width grows too, so frequency is never shown by colour alone. Colours are opaque: segment lines
 * and joint dots overlap, and transparency would show darker spots at every joint.
 */
type Rgb = readonly [number, number, number];

const MAGENTA_PURPLE: readonly Rgb[] = [
  [247, 104, 161], // pink
  [221, 52, 151], // magenta
  [174, 1, 126], // deep magenta
  [73, 0, 106], // dark purple
];

/** Colour stops from least to most ridden, per base map theme. */
export const HEAT_COLOR_STOPS: Readonly<Record<BaseMapTheme, readonly Rgb[]>> = {
  light: MAGENTA_PURPLE,
  dark: [...MAGENTA_PURPLE].reverse().map(([r, g, b], i) =>
    // On dark maps the darkest stop would vanish: lift it to a visible violet.
    i === 0 ? ([Math.max(r, 122), g, Math.max(b, 160)] as Rgb) : [r, g, b],
  ),
};

export const HEAT_MIN_WIDTH_PX = 2;
export const HEAT_MAX_WIDTH_PX = 6;
const OPAQUE = 255;

const clamp01 = (value: number) => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** RGBA colour for an intensity, interpolated between the stops of the theme's ramp. */
export function heatColor(
  intensity: number,
  theme: BaseMapTheme = 'light',
): [number, number, number, number] {
  const stops = HEAT_COLOR_STOPS[theme];
  const t = clamp01(intensity);
  const scaled = t * (stops.length - 1);
  const index = Math.min(Math.floor(scaled), stops.length - 2);
  const from = stops[index] ?? stops[0] ?? [0, 0, 0];
  const to = stops[index + 1] ?? from;
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

/** CSS gradient matching the theme's colour ramp, for the legend. */
export function heatLegendGradient(theme: BaseMapTheme = 'light'): string {
  return `linear-gradient(to right, ${HEAT_COLOR_STOPS[theme]
    .map(([r, g, b]) => `rgb(${r} ${g} ${b})`)
    .join(', ')})`;
}

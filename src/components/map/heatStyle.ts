import type { BaseMapTheme, HeatPaletteId } from '@/types';

/**
 * Visual encoding of heat map intensity (0..1, BR-12), in the colour ramp the user chose (OD-27):
 * - **Magenta–purple** (default): hues not used by the base maps (whose roads are yellow and
 *   orange) or by the blue segment overlay, so ridden roads stand out.
 * - **Fire**: light orange to deep red, the original ramp.
 * On a light base map the colour gets darker as intensity rises; on a dark base map the ramp is
 * reversed, so the busiest roads always have the most contrast. Width grows too, so frequency is
 * never shown by colour alone. Colours are opaque: segment lines and joint dots overlap, and
 * transparency would show darker spots at every joint.
 */
type Rgb = readonly [number, number, number];

interface HeatPalette {
  readonly label: string;
  /** Colour stops from least to most ridden, per base map theme. */
  readonly stops: Readonly<Record<BaseMapTheme, readonly Rgb[]>>;
}

const MAGENTA_PURPLE: readonly Rgb[] = [
  [247, 104, 161], // pink
  [221, 52, 151], // magenta
  [174, 1, 126], // deep magenta
  [73, 0, 106], // dark purple
];

const FIRE: readonly Rgb[] = [
  [254, 178, 76], // light orange
  [253, 141, 60], // orange
  [240, 59, 32], // red-orange
  [189, 0, 38], // deep red
];

export const HEAT_PALETTES: Readonly<Record<HeatPaletteId, HeatPalette>> = {
  'magenta-purple': {
    label: 'Magenta–purple',
    stops: {
      light: MAGENTA_PURPLE,
      // Reversed for dark maps; the darkest stop would vanish there, so it is lifted to violet.
      dark: [[122, 0, 160], ...[...MAGENTA_PURPLE].reverse().slice(1)],
    },
  },
  fire: {
    label: 'Fire (orange–red)',
    stops: { light: FIRE, dark: [...FIRE].reverse() },
  },
};

export const DEFAULT_HEAT_PALETTE: HeatPaletteId = 'magenta-purple';

/** The palettes the user can choose, default first. */
export const HEAT_PALETTE_OPTIONS: readonly {
  readonly id: HeatPaletteId;
  readonly label: string;
}[] = (Object.keys(HEAT_PALETTES) as HeatPaletteId[]).map((id) => ({
  id,
  label: HEAT_PALETTES[id].label,
}));

export const HEAT_MIN_WIDTH_PX = 2;
export const HEAT_MAX_WIDTH_PX = 6;
const OPAQUE = 255;

const clamp01 = (value: number) => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** RGBA colour for an intensity, interpolated between the stops of the palette's ramp. */
export function heatColor(
  intensity: number,
  theme: BaseMapTheme = 'light',
  palette: HeatPaletteId = DEFAULT_HEAT_PALETTE,
): [number, number, number, number] {
  const stops = HEAT_PALETTES[palette].stops[theme];
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

/** CSS gradient matching the palette's colour ramp for the theme, for the legend. */
export function heatLegendGradient(
  theme: BaseMapTheme = 'light',
  palette: HeatPaletteId = DEFAULT_HEAT_PALETTE,
): string {
  return `linear-gradient(to right, ${HEAT_PALETTES[palette].stops[theme]
    .map(([r, g, b]) => `rgb(${r} ${g} ${b})`)
    .join(', ')})`;
}

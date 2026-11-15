import { describe, expect, it } from 'vitest';
import {
  DEFAULT_HEAT_PALETTE,
  HEAT_MAX_WIDTH_PX,
  HEAT_MIN_WIDTH_PX,
  HEAT_PALETTE_OPTIONS,
  HEAT_PALETTES,
  heatColor,
  heatLegendGradient,
  heatWidth,
} from '@/components/map/heatStyle';
import type { BaseMapTheme, HeatPaletteId } from '@/types';

const luminance = ([r, g, b]: readonly number[]) =>
  0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
const steps = [0, 0.25, 0.5, 0.75, 1];
const palettes = Object.keys(HEAT_PALETTES) as HeatPaletteId[];
const themes: BaseMapTheme[] = ['light', 'dark'];
const every = palettes.flatMap((palette) => themes.map((theme) => [palette, theme] as const));

describe('BR-12 / BR-32: heat map styling', () => {
  it('offers magenta–purple (the default) and the original fire ramp', () => {
    expect(HEAT_PALETTE_OPTIONS).toEqual([
      { id: 'magenta-purple', label: 'Magenta–purple' },
      { id: 'fire', label: 'Fire (orange–red)' },
    ]);
    expect(DEFAULT_HEAT_PALETTE).toBe('magenta-purple');
    expect(heatColor(0.5)).toEqual(heatColor(0.5, 'light', 'magenta-purple'));
  });

  it('keeps the original fire colours on light maps', () => {
    expect(heatColor(0, 'light', 'fire')).toEqual([254, 178, 76, 255]);
    expect(heatColor(1, 'light', 'fire')).toEqual([189, 0, 38, 255]);
  });

  it.each(every)('%s on %s: uses the first and last stops at the ends', (palette, theme) => {
    const stops = HEAT_PALETTES[palette].stops[theme];
    expect(heatColor(0, theme, palette).slice(0, 3)).toEqual([...(stops[0] ?? [])]);
    expect(heatColor(1, theme, palette).slice(0, 3)).toEqual([...(stops.at(-1) ?? [])]);
  });

  it.each(palettes)(
    '%s: darker on light maps and lighter on dark maps as rides rise',
    (palette) => {
      const light = steps.map((t) => luminance(heatColor(t, 'light', palette)));
      const dark = steps.map((t) => luminance(heatColor(t, 'dark', palette)));
      expect(light).toEqual([...light].sort((a, b) => b - a));
      expect(dark).toEqual([...dark].sort((a, b) => a - b));
      expect(dark[0]).toBeGreaterThan(30); // the least ridden roads stay visible on a dark map
    },
  );

  it('gets wider as intensity rises, whatever the colours (AC-12)', () => {
    const width = steps.map(heatWidth);
    expect(width).toEqual([...width].sort((a, b) => a - b));
    expect(width[0]).toBe(HEAT_MIN_WIDTH_PX);
    expect(width.at(-1)).toBe(HEAT_MAX_WIDTH_PX);
  });

  it('magenta–purple uses hues unlike the yellow and orange roads: red and blue above green', () => {
    for (const theme of themes) {
      for (const t of steps) {
        const [r, g, b] = heatColor(t, theme, 'magenta-purple');
        expect(b).toBeGreaterThan(g);
        expect(r).toBeGreaterThan(g);
      }
    }
  });

  it('is opaque at every intensity, so lines and joint dots blend seamlessly', () => {
    for (const [palette, theme] of every) {
      expect(steps.map((t) => heatColor(t, theme, palette)[3])).toEqual([255, 255, 255, 255, 255]);
    }
  });

  it('gives the legend the same ramp as the map', () => {
    expect(heatLegendGradient('light')).toContain('rgb(247 104 161)');
    expect(heatLegendGradient('light', 'fire')).toBe(
      'linear-gradient(to right, rgb(254 178 76), rgb(253 141 60), rgb(240 59 32), rgb(189 0 38))',
    );
    expect(heatLegendGradient('dark', 'fire')).not.toEqual(heatLegendGradient('light', 'fire'));
  });

  it('clamps out-of-range and invalid input', () => {
    expect(heatColor(-1)).toEqual(heatColor(0));
    expect(heatColor(2)).toEqual(heatColor(1));
    expect(heatColor(Number.NaN)).toEqual(heatColor(0));
    expect(heatWidth(5)).toBe(HEAT_MAX_WIDTH_PX);
  });
});

import { describe, expect, it } from 'vitest';
import {
  HEAT_COLOR_STOPS,
  HEAT_MAX_WIDTH_PX,
  HEAT_MIN_WIDTH_PX,
  heatColor,
  heatLegendGradient,
  heatWidth,
} from '@/components/map/heatStyle';

const luminance = ([r, g, b]: readonly number[]) =>
  0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
const steps = [0, 0.25, 0.5, 0.75, 1];

describe('BR-12 / BR-32: heat map styling', () => {
  it.each(['light', 'dark'] as const)('uses the first and last stops at the ends (%s)', (theme) => {
    expect(heatColor(0, theme).slice(0, 3)).toEqual([...(HEAT_COLOR_STOPS[theme][0] ?? [])]);
    expect(heatColor(1, theme).slice(0, 3)).toEqual([...(HEAT_COLOR_STOPS[theme].at(-1) ?? [])]);
  });

  it('on a light map, gets darker and wider as intensity rises (AC-12)', () => {
    const lum = steps.map((t) => luminance(heatColor(t, 'light')));
    const width = steps.map(heatWidth);
    expect(lum).toEqual([...lum].sort((a, b) => b - a));
    expect(width).toEqual([...width].sort((a, b) => a - b));
    expect(width[0]).toBe(HEAT_MIN_WIDTH_PX);
    expect(width.at(-1)).toBe(HEAT_MAX_WIDTH_PX);
  });

  it('on a dark map, gets lighter as intensity rises, so the busiest roads stand out most', () => {
    const lum = steps.map((t) => luminance(heatColor(t, 'dark')));
    expect(lum).toEqual([...lum].sort((a, b) => a - b));
    expect(lum[0]).toBeGreaterThan(30); // the least ridden roads stay visible on a dark map
  });

  it('uses magenta–purple hues: red and blue above green, unlike the yellow and orange roads', () => {
    for (const theme of ['light', 'dark'] as const) {
      for (const t of steps) {
        const [r, g, b] = heatColor(t, theme);
        expect(b).toBeGreaterThan(g);
        expect(r).toBeGreaterThan(g);
      }
    }
  });

  it('is opaque at every intensity, so lines and joint dots blend seamlessly', () => {
    expect(steps.map((t) => heatColor(t)[3])).toEqual([255, 255, 255, 255, 255]);
  });

  it('defaults to the light ramp, and the legend matches each ramp', () => {
    expect(heatColor(0.5)).toEqual(heatColor(0.5, 'light'));
    expect(heatLegendGradient('light')).toContain('rgb(247 104 161)');
    expect(heatLegendGradient('dark')).not.toEqual(heatLegendGradient('light'));
  });

  it('clamps out-of-range and invalid input', () => {
    expect(heatColor(-1)).toEqual(heatColor(0));
    expect(heatColor(2)).toEqual(heatColor(1));
    expect(heatColor(Number.NaN)).toEqual(heatColor(0));
    expect(heatWidth(5)).toBe(HEAT_MAX_WIDTH_PX);
  });
});

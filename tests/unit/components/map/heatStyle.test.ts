import { describe, expect, it } from 'vitest';
import {
  HEAT_COLOR_STOPS,
  HEAT_MAX_WIDTH_PX,
  HEAT_MIN_WIDTH_PX,
  heatColor,
  heatWidth,
} from '@/components/map/heatStyle';

const luminance = ([r, g, b]: readonly number[]) =>
  0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);

describe('heat map styling', () => {
  it('uses the first and last stops at the ends of the scale', () => {
    expect(heatColor(0).slice(0, 3)).toEqual([...(HEAT_COLOR_STOPS[0] ?? [])]);
    expect(heatColor(1).slice(0, 3)).toEqual([...(HEAT_COLOR_STOPS.at(-1) ?? [])]);
  });

  it('gets darker and wider as intensity rises (AC-12)', () => {
    const steps = [0, 0.25, 0.5, 0.75, 1];
    const lum = steps.map((t) => luminance(heatColor(t)));
    const width = steps.map(heatWidth);

    expect(lum).toEqual([...lum].sort((a, b) => b - a));
    // Opaque at every intensity, so overlapping lines and joint dots blend seamlessly.
    expect(steps.map((t) => heatColor(t)[3])).toEqual([255, 255, 255, 255, 255]);
    expect(width).toEqual([...width].sort((a, b) => a - b));
    expect(width[0]).toBe(HEAT_MIN_WIDTH_PX);
    expect(width.at(-1)).toBe(HEAT_MAX_WIDTH_PX);
  });

  it('clamps out-of-range and invalid input', () => {
    expect(heatColor(-1)).toEqual(heatColor(0));
    expect(heatColor(2)).toEqual(heatColor(1));
    expect(heatColor(Number.NaN)).toEqual(heatColor(0));
    expect(heatWidth(5)).toBe(HEAT_MAX_WIDTH_PX);
  });
});

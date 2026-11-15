import { heatLegendGradient } from '@/components/map/heatStyle';
import type { BaseMapTheme, HeatPaletteId } from '@/types';

interface HeatLegendProps {
  /** Highest number of rides on any road segment. */
  maxFrequency: number;
  /** Base map theme the heat map colours follow (BR-32). */
  theme?: BaseMapTheme;
  /** The chosen heat map colours (OD-27). */
  palette?: HeatPaletteId;
}

const rides = (count: number) =>
  `${count.toLocaleString('en-US')} ${count === 1 ? 'ride' : 'rides'}`;

/** Explains the heat map colours: how many rides used a road (BR-12, AC-12). */
export function HeatLegend({ maxFrequency, theme = 'light', palette }: HeatLegendProps) {
  return (
    <figure
      aria-label="Heat map legend"
      className="pointer-events-none absolute bottom-8 left-3 rounded-lg bg-white/90 px-3 py-2 text-xs text-slate-700 shadow-sm backdrop-blur"
    >
      <figcaption className="mb-1 font-medium">Rides on a road</figcaption>
      <div
        aria-hidden="true"
        className="h-2 w-36 rounded-full"
        style={{ background: heatLegendGradient(theme, palette) }}
      />
      <div className="mt-1 flex justify-between gap-4">
        <span>{rides(1)}</span>
        <span>{rides(maxFrequency)}</span>
      </div>
    </figure>
  );
}

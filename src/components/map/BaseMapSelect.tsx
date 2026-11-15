import type { BaseMapOption } from '@/types';

interface BaseMapSelectProps {
  readonly options: readonly BaseMapOption[];
  readonly selectedId: string;
  readonly onSelect: (id: string) => void;
}

/** Chooses the base map style (BR-32). Presentational: the container owns the choice. */
export function BaseMapSelect({ options, selectedId, onSelect }: BaseMapSelectProps) {
  return (
    <label className="flex items-center gap-2 rounded-lg bg-white/90 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm backdrop-blur">
      Map style
      <select
        className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 focus-visible:outline-2 focus-visible:outline-orange-500"
        value={selectedId}
        onChange={(event) => onSelect(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

interface MapOptionSelectProps {
  /** Visible label, e.g. "Map style". */
  readonly label: string;
  readonly options: readonly { readonly id: string; readonly label: string }[];
  readonly selectedId: string;
  readonly onSelect: (id: string) => void;
}

/** A labelled choice shown over the map (BR-32). Presentational: the container owns the choice. */
export function MapOptionSelect({ label, options, selectedId, onSelect }: MapOptionSelectProps) {
  return (
    <label className="flex items-center justify-between gap-2 text-xs font-medium text-slate-700">
      {label}
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

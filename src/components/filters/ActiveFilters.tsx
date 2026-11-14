interface ActiveFiltersProps {
  items: readonly { readonly label: string; readonly value: string }[];
  /** False while nothing is filtered: the reset button is then disabled. */
  canReset: boolean;
  onReset: () => void;
}

/**
 * Shows the currently active filters as label/value pairs (UX-06), with a reset-to-all button
 * (BR-15, UX-07). Prop-driven only.
 */
export function ActiveFilters({ items, canReset, onReset }: ActiveFiltersProps) {
  return (
    <section
      aria-label="Active filters"
      className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
    >
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
        {items.map((item) => (
          <div key={item.label} className="contents">
            <dt className="text-slate-500">{item.label}</dt>
            <dd className="text-slate-800">{item.value}</dd>
          </div>
        ))}
      </dl>
      <button
        type="button"
        onClick={onReset}
        disabled={!canReset}
        className="self-start rounded-md border border-slate-300 bg-white px-3 py-1 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      >
        Reset filters
      </button>
    </section>
  );
}

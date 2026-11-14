interface ActiveFiltersProps {
  items: readonly { readonly label: string; readonly value: string }[];
}

/** Shows the currently active filters as label/value pairs (UX-06). Prop-driven only. */
export function ActiveFilters({ items }: ActiveFiltersProps) {
  return (
    <section
      aria-label="Active filters"
      className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
    >
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
        {items.map((item) => (
          <div key={item.label} className="contents">
            <dt className="text-slate-500">{item.label}</dt>
            <dd className="text-slate-800">{item.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

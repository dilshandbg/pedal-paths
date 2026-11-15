import { useId } from 'react';

export interface SegmentSortOption<S extends string> {
  readonly value: S;
  readonly label: string;
}

interface SegmentListItem {
  readonly segmentId: string;
  readonly name: string;
  readonly details: string;
}

interface SegmentBrowserProps<S extends string> {
  query: string;
  /** Raw text of the distance inputs, in km. */
  minDistanceKm: string;
  maxDistanceKm: string;
  sort: S;
  sortOptions: readonly SegmentSortOption<S>[];
  items: readonly SegmentListItem[];
  totalCount: number;
  onQueryChange: (query: string) => void;
  onMinDistanceChange: (value: string) => void;
  onMaxDistanceChange: (value: string) => void;
  onSortChange: (sort: S) => void;
  onSelect: (segmentId: string) => void;
}

const inputClass =
  'w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:outline-none';

/**
 * Search, distance filter, sort and the list of stored segments (BR-25, AC-25). Presentational:
 * the parent filters and sorts.
 */
export function SegmentBrowser<S extends string>({
  query,
  minDistanceKm,
  maxDistanceKm,
  sort,
  sortOptions,
  items,
  totalCount,
  onQueryChange,
  onMinDistanceChange,
  onMaxDistanceChange,
  onSortChange,
  onSelect,
}: SegmentBrowserProps<S>) {
  const id = useId();
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-q`} className="text-xs font-medium text-slate-600">
          Search by name
        </label>
        <input
          id={`${id}-q`}
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          className={inputClass}
        />
      </div>
      <fieldset className="grid grid-cols-2 gap-2">
        <legend className="mb-1 text-xs font-medium text-slate-600">Distance (km)</legend>
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          Minimum distance (km)
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={minDistanceKm}
            onChange={(event) => onMinDistanceChange(event.target.value)}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          Maximum distance (km)
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={maxDistanceKm}
            onChange={(event) => onMaxDistanceChange(event.target.value)}
            className={inputClass}
          />
        </label>
      </fieldset>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-sort`} className="text-xs font-medium text-slate-600">
          Sort by
        </label>
        <select
          id={`${id}-sort`}
          value={sort}
          onChange={(event) => onSortChange(event.target.value as S)}
          className={inputClass}
        >
          {sortOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <p role="status" className="text-xs text-slate-500">
        {items.length === totalCount
          ? `${totalCount.toLocaleString('en-US')} ${totalCount === 1 ? 'segment' : 'segments'}`
          : `${items.length.toLocaleString('en-US')} of ${totalCount.toLocaleString('en-US')} segments match`}
      </p>
      {items.length > 0 ? (
        <ul aria-label="Segments" className="flex max-h-96 flex-col gap-1 overflow-y-auto pr-1">
          {items.map((item) => (
            <li key={item.segmentId}>
              <button
                type="button"
                onClick={() => onSelect(item.segmentId)}
                className="flex w-full flex-col rounded-md px-2 py-1.5 text-left hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:outline-none"
              >
                <span className="truncate text-sm text-slate-800">{item.name}</span>
                {item.details ? (
                  <span className="text-xs text-slate-500">{item.details}</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : totalCount > 0 ? (
        <p className="text-sm text-slate-500">No segments match the search and distance range.</p>
      ) : null}
    </div>
  );
}

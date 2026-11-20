import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';

export interface TabItem<K extends string> {
  readonly key: K;
  readonly label: string;
  readonly content: ReactNode;
}

interface TabsProps<K extends string> {
  /** Accessible name of the tab list. */
  label: string;
  tabs: readonly TabItem<K>[];
  selected: K;
  onSelect: (key: K) => void;
}

/**
 * WAI-ARIA tabs with arrow-key navigation. Only the selected panel is rendered. Presentational:
 * the selection is controlled by the parent. Tabs share the row but are never narrower than their
 * label: in a narrow container they form two columns, otherwise one row that wraps if needed.
 */
export function Tabs<K extends string>({ label, tabs, selected, onSelect }: TabsProps<K>) {
  const baseId = useId();
  const refs = useRef(new Map<K, HTMLButtonElement>());
  const active = tabs.find((tab) => tab.key === selected) ?? tabs[0];

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const offset = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (offset === 0) return;
    event.preventDefault();
    const next = tabs[(index + offset + tabs.length) % tabs.length];
    if (next) {
      onSelect(next.key);
      refs.current.get(next.key)?.focus();
    }
  };

  return (
    <div className="@container flex flex-col gap-4">
      {/* Two columns when narrow; otherwise one row that wraps rather than overlapping labels. */}
      <div
        role="tablist"
        aria-label={label}
        className="grid grid-cols-2 gap-0.5 rounded-lg bg-slate-200/70 p-1 @min-[17.5rem]:flex @min-[17.5rem]:flex-wrap"
      >
        {tabs.map((tab, index) => {
          const isSelected = tab.key === active?.key;
          return (
            <button
              key={tab.key}
              ref={(element) => {
                if (element) refs.current.set(tab.key, element);
                else refs.current.delete(tab.key);
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${tab.key}`}
              aria-selected={isSelected}
              aria-controls={`${baseId}-panel-${tab.key}`}
              tabIndex={isSelected ? 0 : -1}
              onClick={() => onSelect(tab.key)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              className={`flex-1 rounded-md px-1.5 py-1.5 text-sm font-medium whitespace-nowrap focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:outline-none ${
                isSelected
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {active ? (
        <div
          role="tabpanel"
          id={`${baseId}-panel-${active.key}`}
          aria-labelledby={`${baseId}-tab-${active.key}`}
        >
          {active.content}
        </div>
      ) : null}
    </div>
  );
}

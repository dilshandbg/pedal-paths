import { useId } from 'react';

export interface ChecklistOption {
  readonly value: number;
  readonly label: string;
}

interface OptionChecklistProps {
  legend: string;
  /** Label of the unrestricted state, such as "All years". Checked while nothing is selected. */
  allLabel: string;
  options: readonly ChecklistOption[];
  selected: ReadonlySet<number>;
  onOptionToggle: (value: number, selected: boolean) => void;
  /** Return to the unrestricted state (clear the selection). */
  onSelectAll: () => void;
  /** Shown instead of the options when there are none. */
  emptyMessage: string;
}

/**
 * Opt-in multi-select (ADR-0005): with nothing selected, every option applies, shown as the
 * checked "all" entry. Selecting options narrows to them. Prop-driven only.
 */
export function OptionChecklist({
  legend,
  allLabel,
  options,
  selected,
  onOptionToggle,
  onSelectAll,
  emptyMessage,
}: OptionChecklistProps) {
  const legendId = useId();
  const unrestricted = selected.size === 0;

  return (
    <fieldset aria-labelledby={legendId} className="flex min-w-0 flex-col gap-2">
      <legend id={legendId} className="text-xs font-medium tracking-wide text-slate-600 uppercase">
        {legend}
      </legend>
      {options.length === 0 ? (
        <p className="text-sm text-slate-500">{emptyMessage}</p>
      ) : (
        <ul className="flex flex-wrap gap-x-4 gap-y-1">
          <li className="basis-full">
            <Check
              label={allLabel}
              checked={unrestricted}
              onChange={(checked) => {
                if (checked) onSelectAll();
              }}
            />
          </li>
          {options.map((option) => (
            <li key={option.value}>
              <Check
                label={option.label}
                checked={selected.has(option.value)}
                onChange={(checked) => onOptionToggle(option.value, checked)}
              />
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}

interface CheckProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function Check({ label, checked, onChange }: CheckProps) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-sm text-slate-800 hover:bg-slate-50">
      <input
        type="checkbox"
        className="size-4 shrink-0 accent-orange-600"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}

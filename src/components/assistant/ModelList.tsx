import { ConfirmAction } from '@/components/common/ConfirmAction';
import { StatusMessage } from '@/components/assistant/StatusMessage';

/** One model, prepared by the caller (`describeModel`). */
export interface ModelItem {
  readonly id: string;
  readonly details: string;
  readonly capabilities: string;
  readonly limitation: string | null;
  readonly testLabel: string;
  readonly testTone: 'ok' | 'warning' | 'error' | 'neutral';
  readonly cases: readonly {
    readonly title: string;
    readonly passed: boolean;
    readonly problems: readonly string[];
  }[];
  readonly selected: boolean;
  readonly canSelect: boolean;
  readonly canTest: boolean;
  readonly testing: boolean;
}

interface ModelListProps {
  items: readonly ModelItem[];
  onSelect: (id: string) => void;
  onTest: (id: string) => void;
  onRemove: (id: string) => void;
}

/**
 * Installed models with their details, capabilities, test result and actions (UX-14, AC-47,
 * AC-49 – AC-51). Presentational: it reports the chosen action.
 */
export function ModelList({ items, onSelect, onTest, onRemove }: ModelListProps) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-slate-600">No models are installed yet. Download one below.</p>
    );
  }
  return (
    <ul aria-label="Installed models" className="flex flex-col gap-3">
      {items.map((item) => (
        <li
          key={item.id}
          aria-label={item.id}
          className={`flex flex-col gap-2 rounded-lg p-3 ring-1 ${
            item.selected ? 'bg-orange-50 ring-orange-300' : 'bg-white ring-slate-200'
          }`}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold break-all text-slate-900">{item.id}</h3>
            {item.selected ? (
              <span className="text-xs font-medium text-orange-800">Selected</span>
            ) : null}
          </div>
          <p className="text-xs text-slate-600">{item.details}</p>
          <p className="text-xs text-slate-600">{item.capabilities}</p>
          {item.limitation ? <StatusMessage tone="warning">{item.limitation}</StatusMessage> : null}
          {item.limitation && !item.canTest && !item.canSelect ? null : (
            <StatusMessage tone={item.testTone}>{item.testLabel}</StatusMessage>
          )}
          {item.cases.length > 0 ? (
            <details className="text-xs text-slate-700">
              <summary className="cursor-pointer">Test results</summary>
              <ul aria-label={`Test results for ${item.id}`} className="mt-1 flex flex-col gap-1">
                {item.cases.map((c) => (
                  <li key={c.title}>
                    <span className="font-medium">{c.passed ? 'Passed' : 'Failed'}:</span> {c.title}
                    {c.problems.length > 0 ? (
                      <ul className="list-disc pl-4">
                        {c.problems.map((problem) => (
                          <li key={problem}>{problem}</li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!item.canSelect}
              onClick={() => onSelect(item.id)}
              aria-label={`Select ${item.id}`}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {item.selected ? 'Selected' : 'Select'}
            </button>
            <button
              type="button"
              disabled={!item.canTest}
              onClick={() => onTest(item.id)}
              aria-label={`Test ${item.id}`}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {item.testing ? 'Testing…' : 'Test model'}
            </button>
            <ConfirmAction
              label={`Remove ${item.id}`}
              question={`Remove ${item.id} from this computer? You can download it again later.`}
              confirmLabel="Remove model"
              disabled={item.testing}
              onConfirm={() => onRemove(item.id)}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

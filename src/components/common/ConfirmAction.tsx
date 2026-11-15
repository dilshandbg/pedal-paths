import { useState } from 'react';

interface ConfirmActionProps {
  /** Button text, e.g. "Remove segment". */
  label: string;
  /** Question shown before the action runs, e.g. "Remove this segment?". */
  question: string;
  /** Text of the button that carries out the action. */
  confirmLabel: string;
  disabled?: boolean;
  onConfirm: () => void;
}

/**
 * A destructive action that asks for confirmation inline before it runs. Presentational: it only
 * reports the confirmed click.
 */
export function ConfirmAction({
  label,
  question,
  confirmLabel,
  disabled = false,
  onConfirm,
}: ConfirmActionProps) {
  const [asking, setAsking] = useState(false);

  if (!asking) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => setAsking(true)}
        className="self-start rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {label}
      </button>
    );
  }
  return (
    <div
      role="group"
      aria-label={question}
      className="flex flex-col gap-2 rounded-md border border-red-200 bg-red-50 p-3"
    >
      <p className="text-sm text-red-800">{question}</p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            setAsking(false);
            onConfirm();
          }}
          className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
        >
          {confirmLabel}
        </button>
        <button
          type="button"
          onClick={() => setAsking(false)}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

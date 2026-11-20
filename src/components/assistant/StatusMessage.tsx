import type { ReactNode } from 'react';

export type StatusTone = 'ok' | 'warning' | 'error' | 'neutral';

const TONE_CLASSES: Readonly<Record<StatusTone, string>> = {
  ok: 'bg-emerald-50 text-emerald-900 ring-emerald-200',
  warning: 'bg-amber-50 text-amber-900 ring-amber-200',
  error: 'bg-red-50 text-red-800 ring-red-200',
  neutral: 'bg-slate-50 text-slate-700 ring-slate-200',
};

interface StatusMessageProps {
  tone: StatusTone;
  children: ReactNode;
  /** `status` for updates the user should hear; `alert` for failures. */
  role?: 'status' | 'alert';
}

/** A short message with a tone. The text carries the meaning; the colour only supports it. */
export function StatusMessage({ tone, children, role }: StatusMessageProps) {
  return (
    <p role={role} className={`rounded-md px-3 py-2 text-sm ring-1 ${TONE_CLASSES[tone]}`}>
      {children}
    </p>
  );
}

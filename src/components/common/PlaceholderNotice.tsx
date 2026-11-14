import type { ReactNode } from 'react';

interface PlaceholderNoticeProps {
  label?: string;
  children: ReactNode;
}

/** Dashed placeholder box that marks a scaffolded area not built yet. */
export function PlaceholderNotice({ label, children }: PlaceholderNoticeProps) {
  return (
    <div className="flex min-h-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-center">
      {label ? (
        <span className="text-xs font-medium tracking-wide text-slate-600 uppercase">{label}</span>
      ) : null}
      <span className="text-sm text-slate-500">{children}</span>
    </div>
  );
}

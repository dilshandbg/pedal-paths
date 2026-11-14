import { useId, type ReactNode } from 'react';

interface PanelProps {
  title: string;
  description?: string;
  children?: ReactNode;
}

/** Card container with a titled header, used by the side panels. */
export function Panel({ title, description, children }: PanelProps) {
  const headingId = useId();

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col rounded-xl border border-slate-200 bg-white shadow-sm"
    >
      <header className="border-b border-slate-100 px-4 py-3">
        <h2 id={headingId} className="text-sm font-semibold tracking-wide text-slate-700 uppercase">
          {title}
        </h2>
        {description ? <p className="mt-0.5 text-xs text-slate-500">{description}</p> : null}
      </header>
      <div className="flex flex-1 flex-col gap-3 p-4">{children}</div>
    </section>
  );
}

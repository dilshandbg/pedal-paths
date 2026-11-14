import { Panel } from '@/components/common/Panel';
import { PlaceholderNotice } from '@/components/common/PlaceholderNotice';

interface StatisticsPanelProps {
  /** Formatted statistics, or null when no export is loaded. */
  items: readonly { readonly label: string; readonly value: string }[] | null;
}

/** Summary statistics of the selected activities (BR-14, UX-08). Prop-driven only. */
export function StatisticsPanel({ items }: StatisticsPanelProps) {
  return (
    <Panel title="Statistics" description="Summary of the selected activities.">
      {items === null ? (
        <PlaceholderNotice>
          Statistics will appear here once activities are loaded.
        </PlaceholderNotice>
      ) : (
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-1">
          {items.map((item) => (
            <div
              key={item.label}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
            >
              <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase">
                {item.label}
              </dt>
              <dd className="mt-0.5 text-xl font-semibold text-slate-800 tabular-nums">
                {item.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </Panel>
  );
}

import type { ReactNode } from 'react';

interface DashboardLayoutProps {
  header: ReactNode;
  filters: ReactNode;
  map: ReactNode;
  statistics: ReactNode;
}

/**
 * Responsive three-region dashboard layout. It is a pure layout component with no data or state.
 * - < md: stacked (filters, map, statistics)
 * - md: filters | map, statistics full width below
 * - lg+: filters | map | statistics, full viewport height
 */
export function DashboardLayout({ header, filters, map, statistics }: DashboardLayoutProps) {
  return (
    <div className="flex min-h-full flex-col lg:h-full">
      {header}
      <div className="grid flex-1 grid-cols-1 gap-4 p-4 md:grid-cols-[16rem_minmax(0,1fr)] lg:min-h-0 lg:grid-cols-[18rem_minmax(0,1fr)_20rem]">
        <aside aria-label="Activity filters" className="lg:min-h-0 lg:overflow-y-auto">
          {filters}
        </aside>
        <main className="min-h-[60vh] md:min-h-[70vh] lg:min-h-0">{map}</main>
        <aside
          aria-label="Activity statistics"
          className="md:col-span-2 lg:col-span-1 lg:min-h-0 lg:overflow-y-auto"
        >
          {statistics}
        </aside>
      </div>
    </div>
  );
}

import type { ReactNode } from 'react';
import { Panel } from '@/components/common/Panel';

interface FilterPanelProps {
  /** The year filter control, supplied by `features/filters`. */
  years: ReactNode;
  /** The month filter control, supplied by `features/filters`. */
  months: ReactNode;
  /** The ride filter control, supplied by `features/filters`. */
  rides: ReactNode;
}

/** Filter panel: lays out the year, month and ride filters passed in by `features/filters`. */
export function FilterPanel({ years, months, rides }: FilterPanelProps) {
  return (
    <Panel title="Filters" description="Narrow down the activities shown on the map.">
      {years}
      {months}
      {rides}
    </Panel>
  );
}

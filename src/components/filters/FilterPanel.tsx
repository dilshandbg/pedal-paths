import type { ReactNode } from 'react';
import { Panel } from '@/components/common/Panel';
import { PlaceholderNotice } from '@/components/common/PlaceholderNotice';

interface FilterPanelProps {
  /** The year filter control, supplied by `features/filters`. */
  years: ReactNode;
  /** The ride filter control, supplied by `features/filters`. */
  rides: ReactNode;
}

/** Filter panel. Month is still a placeholder; the year and ride filters are passed in. */
export function FilterPanel({ years, rides }: FilterPanelProps) {
  return (
    <Panel title="Filters" description="Narrow down the activities shown on the map.">
      {years}
      <PlaceholderNotice label="Month">Coming soon</PlaceholderNotice>
      {rides}
    </Panel>
  );
}

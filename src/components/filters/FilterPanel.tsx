import type { ReactNode } from 'react';
import { Panel } from '@/components/common/Panel';
import { PlaceholderNotice } from '@/components/common/PlaceholderNotice';

const PLACEHOLDER_SECTIONS = ['Year', 'Month'] as const;

interface FilterPanelProps {
  /** The ride filter control, supplied by `features/filters`. */
  rides: ReactNode;
}

/** Filter panel. Year and month are still placeholders; the ride filter is passed in. */
export function FilterPanel({ rides }: FilterPanelProps) {
  return (
    <Panel title="Filters" description="Narrow down the activities shown on the map.">
      {PLACEHOLDER_SECTIONS.map((section) => (
        <PlaceholderNotice key={section} label={section}>
          Coming soon
        </PlaceholderNotice>
      ))}
      {rides}
    </Panel>
  );
}

import { Panel } from '@/components/common/Panel';
import { PlaceholderNotice } from '@/components/common/PlaceholderNotice';

const FILTER_SECTIONS = ['Year', 'Month', 'Ride'] as const;

/** Placeholder for the filter panel. The real filter controls will come from `features/filters`. */
export function FilterPanel() {
  return (
    <Panel title="Filters" description="Narrow down the activities shown on the map.">
      {FILTER_SECTIONS.map((section) => (
        <PlaceholderNotice key={section} label={section}>
          Coming soon
        </PlaceholderNotice>
      ))}
    </Panel>
  );
}

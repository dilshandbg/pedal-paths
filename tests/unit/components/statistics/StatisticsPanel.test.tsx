import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatisticsPanel } from '@/components/statistics/StatisticsPanel';

describe('BR-14 / UX-08: StatisticsPanel', () => {
  it('shows each statistic as a term and its value', () => {
    render(
      <StatisticsPanel
        items={[
          { label: 'Rides', value: '3 rides' },
          { label: 'Distance', value: '42.0 km' },
          { label: 'Elevation gain', value: '310 m' },
        ]}
      />,
    );

    const panel = screen.getByRole('region', { name: 'Statistics' });
    expect(
      within(panel)
        .getAllByRole('term')
        .map((term) => term.textContent),
    ).toEqual(['Rides', 'Distance', 'Elevation gain']);
    expect(
      within(panel)
        .getAllByRole('definition')
        .map((value) => value.textContent),
    ).toEqual(['3 rides', '42.0 km', '310 m']);
  });

  it('shows a placeholder before an export is loaded', () => {
    render(<StatisticsPanel items={null} />);

    expect(screen.queryByRole('term')).not.toBeInTheDocument();
    expect(
      screen.getByText('Statistics will appear here once activities are loaded.'),
    ).toBeInTheDocument();
  });
});

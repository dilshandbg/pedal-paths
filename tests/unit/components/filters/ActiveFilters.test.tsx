import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ActiveFilters } from '@/components/filters/ActiveFilters';

describe('UX-06: ActiveFilters', () => {
  it('shows each active filter as a term and its value', () => {
    render(
      <ActiveFilters
        items={[
          { label: 'Years', value: '2023' },
          { label: 'Months', value: 'November' },
          { label: 'Rides', value: '1 ride deselected' },
        ]}
      />,
    );

    const region = screen.getByRole('region', { name: 'Active filters' });
    const terms = within(region).getAllByRole('term');
    const values = within(region).getAllByRole('definition');
    expect(terms.map((term) => term.textContent)).toEqual(['Years', 'Months', 'Rides']);
    expect(values.map((value) => value.textContent)).toEqual([
      '2023',
      'November',
      '1 ride deselected',
    ]);
  });
});

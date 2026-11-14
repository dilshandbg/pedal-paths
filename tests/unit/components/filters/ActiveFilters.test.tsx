import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ActiveFilters } from '@/components/filters/ActiveFilters';

const items = [
  { label: 'Years', value: '2023' },
  { label: 'Months', value: 'November' },
  { label: 'Rides', value: '1 ride deselected' },
];

describe('UX-06: ActiveFilters', () => {
  it('shows each active filter as a term and its value', () => {
    render(<ActiveFilters items={items} canReset onReset={vi.fn()} />);

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

describe('BR-15 / UX-07: reset-to-all button', () => {
  it('calls onReset when clicked', async () => {
    const user = userEvent.setup();
    const onReset = vi.fn();
    render(<ActiveFilters items={items} canReset onReset={onReset} />);

    await user.click(screen.getByRole('button', { name: 'Reset filters' }));
    expect(onReset).toHaveBeenCalledOnce();
  });

  it('is disabled while nothing is filtered', async () => {
    const user = userEvent.setup();
    const onReset = vi.fn();
    render(<ActiveFilters items={items} canReset={false} onReset={onReset} />);

    const button = screen.getByRole('button', { name: 'Reset filters' });
    expect(button).toBeDisabled();
    await user.click(button);
    expect(onReset).not.toHaveBeenCalled();
  });
});

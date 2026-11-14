import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RideList, type RideOption } from '@/components/filters/RideList';

const rides: RideOption[] = [
  { activityId: '1', name: 'Morning Ride', date: 'Nov 5, 2023' },
  { activityId: '2', name: 'Evening Ride', date: 'Nov 6, 2023' },
];

describe('BR-09: RideList', () => {
  it('lists each ride as a labelled checkbox with its date', () => {
    render(<RideList rides={rides} excludedActivityIds={new Set()} onRideToggle={vi.fn()} />);

    const group = screen.getByRole('group', { name: 'Rides' });
    const morning = within(group).getByRole('checkbox', { name: 'Morning Ride' });
    expect(morning).toBeChecked();
    expect(morning).toHaveAccessibleDescription('Nov 5, 2023');
    expect(within(group).getAllByRole('checkbox')).toHaveLength(2);
  });

  it('shows deselected rides as unchecked', () => {
    render(<RideList rides={rides} excludedActivityIds={new Set(['2'])} onRideToggle={vi.fn()} />);

    expect(screen.getByRole('checkbox', { name: 'Morning Ride' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Evening Ride' })).not.toBeChecked();
  });

  it('reports deselecting and reselecting a ride', async () => {
    const user = userEvent.setup();
    const onRideToggle = vi.fn();
    const { rerender } = render(
      <RideList rides={rides} excludedActivityIds={new Set()} onRideToggle={onRideToggle} />,
    );

    await user.click(screen.getByRole('checkbox', { name: 'Evening Ride' }));
    expect(onRideToggle).toHaveBeenLastCalledWith('2', false);

    rerender(
      <RideList rides={rides} excludedActivityIds={new Set(['2'])} onRideToggle={onRideToggle} />,
    );
    await user.click(screen.getByRole('checkbox', { name: 'Evening Ride' }));
    expect(onRideToggle).toHaveBeenLastCalledWith('2', true);
  });

  it('explains that there are no rides before an export is loaded', () => {
    render(<RideList rides={[]} excludedActivityIds={new Set()} onRideToggle={vi.fn()} />);

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByText('Load your Strava export to choose rides.')).toBeInTheDocument();
  });
});

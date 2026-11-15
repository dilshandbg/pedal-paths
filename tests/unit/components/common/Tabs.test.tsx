import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmAction } from '@/components/common/ConfirmAction';
import { Tabs } from '@/components/common/Tabs';

function TwoTabs() {
  const [selected, setSelected] = useState<'a' | 'b'>('a');
  return (
    <Tabs
      label="Sidebar"
      selected={selected}
      onSelect={setSelected}
      tabs={[
        { key: 'a', label: 'Rides', content: <p>Ride panel</p> },
        { key: 'b', label: 'Segments', content: <p>Segment panel</p> },
      ]}
    />
  );
}

describe('Tabs', () => {
  it('shows only the selected panel, labelled by its tab', async () => {
    const user = userEvent.setup();
    render(<TwoTabs />);
    expect(screen.getByRole('tablist', { name: 'Sidebar' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Rides' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: 'Rides' })).toHaveTextContent('Ride panel');
    expect(screen.queryByText('Segment panel')).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Segments' }));
    expect(screen.getByRole('tabpanel', { name: 'Segments' })).toHaveTextContent('Segment panel');
  });

  it('moves between tabs with the arrow keys, wrapping around', async () => {
    const user = userEvent.setup();
    render(<TwoTabs />);
    await user.click(screen.getByRole('tab', { name: 'Rides' }));
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Segments' })).toHaveFocus();
    expect(screen.getByRole('tab', { name: 'Segments' })).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Rides' })).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: 'Segments' })).toHaveFocus();
  });

  it('keeps only the selected tab in the tab order', () => {
    render(<TwoTabs />);
    expect(screen.getByRole('tab', { name: 'Rides' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tab', { name: 'Segments' })).toHaveAttribute('tabindex', '-1');
  });
});

describe('ConfirmAction', () => {
  it('runs the action only after confirmation', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <ConfirmAction
        label="Remove all"
        question="Remove everything?"
        confirmLabel="Yes, remove"
        onConfirm={onConfirm}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Remove all' }));
    expect(screen.getByRole('group', { name: 'Remove everything?' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onConfirm).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Remove all' }));
    await user.click(screen.getByRole('button', { name: 'Yes, remove' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Remove all' })).toBeInTheDocument();
  });
});

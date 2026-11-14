import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { OptionChecklist, type ChecklistOption } from '@/components/filters/OptionChecklist';

const years: ChecklistOption[] = [
  { value: 2024, label: '2024' },
  { value: 2023, label: '2023' },
];

function renderChecklist(selected: number[], options: readonly ChecklistOption[] = years) {
  const onOptionToggle = vi.fn();
  const onSelectAll = vi.fn();
  render(
    <OptionChecklist
      legend="Years"
      allLabel="All years"
      options={options}
      selected={new Set(selected)}
      onOptionToggle={onOptionToggle}
      onSelectAll={onSelectAll}
      emptyMessage="Nothing to choose."
    />,
  );
  return { onOptionToggle, onSelectAll };
}

describe('BR-07: OptionChecklist', () => {
  it('RULE-09: shows the unrestricted state as a checked "All years" entry', () => {
    renderChecklist([]);

    const group = screen.getByRole('group', { name: 'Years' });
    expect(within(group).getByRole('checkbox', { name: 'All years' })).toBeChecked();
    expect(within(group).getByRole('checkbox', { name: '2024' })).not.toBeChecked();
    expect(within(group).getByRole('checkbox', { name: '2023' })).not.toBeChecked();
  });

  it('shows selected options as checked, and "All years" as unchecked', () => {
    renderChecklist([2023]);

    expect(screen.getByRole('checkbox', { name: 'All years' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: '2023' })).toBeChecked();
  });

  it('reports selecting and deselecting an option', async () => {
    const user = userEvent.setup();
    const { onOptionToggle } = renderChecklist([2023]);

    await user.click(screen.getByRole('checkbox', { name: '2024' }));
    expect(onOptionToggle).toHaveBeenLastCalledWith(2024, true);
    await user.click(screen.getByRole('checkbox', { name: '2023' }));
    expect(onOptionToggle).toHaveBeenLastCalledWith(2023, false);
  });

  it('"All years" clears the selection', async () => {
    const user = userEvent.setup();
    const { onSelectAll } = renderChecklist([2023]);

    await user.click(screen.getByRole('checkbox', { name: 'All years' }));
    expect(onSelectAll).toHaveBeenCalledOnce();
  });

  it('shows the empty message when there are no options', () => {
    renderChecklist([], []);

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByText('Nothing to choose.')).toBeInTheDocument();
  });
});

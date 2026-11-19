import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { UploadList, type UploadListItem } from '@/components/uploads/UploadList';

const item = (n: number, patch: Partial<UploadListItem> = {}): UploadListItem => ({
  uploadId: `id-${n}`,
  fileName: `export_${n}.zip`,
  uploadedAt: `Nov ${n}, 2026, 10:00 AM`,
  rides: `${n} rides (${n} new)`,
  distance: `${n * 10}.0 km`,
  statusLabel: 'Complete',
  statusTone: 'ok',
  deleteQuestion: `Delete “export_${n}.zip”?`,
  ...patch,
});

function renderList(props: Partial<Parameters<typeof UploadList>[0]> = {}) {
  const handlers = { onSelect: vi.fn(), onSelectAll: vi.fn(), onDelete: vi.fn() };
  render(
    <UploadList items={[item(1), item(2)]} selectedIds={new Set()} {...handlers} {...props} />,
  );
  return handlers;
}

describe('BR-35 / AC-36: upload list', () => {
  it('shows every upload with its date and time, rides, distance and status', () => {
    renderList({ items: [item(1), item(2, { statusLabel: 'Failed', statusTone: 'error' })] });

    const rows = within(screen.getByRole('list', { name: 'Uploads' })).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    const second = within(screen.getByRole('listitem', { name: 'export_2.zip' }));
    expect(second.getByText('Nov 2, 2026, 10:00 AM')).toBeInTheDocument();
    expect(second.getByText('2 rides (2 new)')).toBeInTheDocument();
    expect(second.getByText('20.0 km')).toBeInTheDocument();
    expect(second.getByText('Failed')).toBeInTheDocument();
  });

  it('reports selecting and deselecting uploads, one or all', async () => {
    const user = userEvent.setup();
    const handlers = renderList({ selectedIds: new Set(['id-2']) });

    await user.click(screen.getByRole('checkbox', { name: 'Select export_1.zip' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select export_2.zip' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select all uploads' }));

    expect(handlers.onSelect.mock.calls).toEqual([
      ['id-1', true],
      ['id-2', false],
    ]);
    expect(handlers.onSelectAll).toHaveBeenCalledWith(true);
    expect(screen.getByRole('checkbox', { name: 'Select export_2.zip' })).toBeChecked();
  });

  it('checks "Select all" when every upload is selected', () => {
    renderList({ selectedIds: new Set(['id-1', 'id-2']) });

    expect(screen.getByRole('checkbox', { name: 'Select all uploads' })).toBeChecked();
  });

  it('deletes one upload only after confirming; cancelling deletes nothing', async () => {
    const user = userEvent.setup();
    const handlers = renderList();
    const row = within(screen.getByRole('listitem', { name: 'export_1.zip' }));

    await user.click(row.getByRole('button', { name: 'Delete' }));
    expect(row.getByText('Delete “export_1.zip”?')).toBeInTheDocument();
    await user.click(row.getByRole('button', { name: 'Cancel' }));
    expect(handlers.onDelete).not.toHaveBeenCalled();

    await user.click(row.getByRole('button', { name: 'Delete' }));
    await user.click(row.getByRole('button', { name: 'Delete upload' }));
    expect(handlers.onDelete).toHaveBeenCalledWith('id-1');
  });

  it('disables every control while busy', () => {
    renderList({ disabled: true });

    for (const control of [...screen.getAllByRole('checkbox'), ...screen.getAllByRole('button')]) {
      expect(control).toBeDisabled();
    }
  });
});

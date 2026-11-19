import { ConfirmAction } from '@/components/common/ConfirmAction';

/** One upload as the list shows it. Prepared by the caller (`describeUpload`). */
export interface UploadListItem {
  readonly uploadId: string;
  readonly fileName: string;
  readonly uploadedAt: string;
  readonly rides: string;
  readonly distance: string;
  readonly statusLabel: string;
  /** Whether the status needs attention (failed, or rides skipped); shown with words too. */
  readonly statusTone: 'ok' | 'warning' | 'error';
  /** Confirmation question for deleting just this upload. */
  readonly deleteQuestion: string;
}

interface UploadListProps {
  items: readonly UploadListItem[];
  selectedIds: ReadonlySet<string>;
  disabled?: boolean;
  onSelect: (uploadId: string, selected: boolean) => void;
  onSelectAll: (selected: boolean) => void;
  onDelete: (uploadId: string) => void;
}

const TONE_CLASSES: Readonly<Record<UploadListItem['statusTone'], string>> = {
  ok: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  warning: 'bg-amber-50 text-amber-900 ring-amber-200',
  error: 'bg-red-50 text-red-800 ring-red-200',
};

/**
 * The upload registry as a selectable list, with a confirmed delete per upload (BR-35, AC-36).
 * Presentational: it reports selections and confirmed deletions.
 */
export function UploadList({
  items,
  selectedIds,
  disabled = false,
  onSelect,
  onSelectAll,
  onDelete,
}: UploadListProps) {
  const allSelected = items.length > 0 && items.every((item) => selectedIds.has(item.uploadId));

  return (
    <div className="flex flex-col gap-2">
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={allSelected}
          disabled={disabled}
          onChange={(event) => onSelectAll(event.target.checked)}
          className="h-4 w-4 accent-orange-500"
        />
        Select all uploads
      </label>
      <ul aria-label="Uploads" className="flex flex-col gap-2">
        {items.map((item) => (
          <li
            key={item.uploadId}
            aria-label={item.fileName}
            className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3"
          >
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={selectedIds.has(item.uploadId)}
                disabled={disabled}
                onChange={(event) => onSelect(item.uploadId, event.target.checked)}
                aria-label={`Select ${item.fileName}`}
                className="mt-0.5 h-4 w-4 accent-orange-500"
              />
              <span
                className="min-w-0 truncate text-sm font-medium text-slate-900"
                title={item.fileName}
              >
                {item.fileName}
              </span>
            </label>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs text-slate-600">
              <dt>Uploaded</dt>
              <dd>{item.uploadedAt}</dd>
              <dt>Rides</dt>
              <dd>{item.rides}</dd>
              <dt>Distance</dt>
              <dd>{item.distance}</dd>
              <dt>Status</dt>
              <dd>
                <span
                  className={`rounded px-1.5 py-0.5 ring-1 ring-inset ${TONE_CLASSES[item.statusTone]}`}
                >
                  {item.statusLabel}
                </span>
              </dd>
            </dl>
            <ConfirmAction
              label="Delete"
              question={item.deleteQuestion}
              confirmLabel="Delete upload"
              disabled={disabled}
              onConfirm={() => onDelete(item.uploadId)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

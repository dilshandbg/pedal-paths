interface ImportReviewRow {
  readonly segmentId: string;
  readonly name: string;
  readonly figures: string;
  readonly status: 'new' | 'update' | 'unchanged';
  readonly statusLabel: string;
  readonly changes: string;
}

interface SegmentImportReviewProps {
  fileName: string;
  /** "2 new, 1 update, 0 unchanged · 5 new efforts". */
  summary: string;
  rows: readonly ImportReviewRow[];
  saving: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const STATUS_STYLES: Readonly<Record<ImportReviewRow['status'], string>> = {
  new: 'bg-emerald-100 text-emerald-800',
  update: 'bg-sky-100 text-sky-800',
  unchanged: 'bg-slate-100 text-slate-600',
};

/**
 * Review of a validated import before anything is stored (BR-22, AC-22): each segment's ID, name,
 * key figures and status, with confirm and cancel. Presentational.
 */
export function SegmentImportReview({
  fileName,
  summary,
  rows,
  saving,
  onConfirm,
  onCancel,
}: SegmentImportReviewProps) {
  return (
    <section
      aria-label="Import review"
      className="flex flex-col gap-3 rounded-md border border-sky-200 bg-sky-50/50 p-3"
    >
      <div>
        <p className="text-sm font-medium text-slate-800">Review {fileName}</p>
        <p className="text-xs text-slate-600">{summary}. Nothing is stored until you confirm.</p>
      </div>
      <div className="max-h-72 overflow-auto rounded border border-slate-200 bg-white">
        <table className="w-full text-left text-xs">
          <caption className="sr-only">Segments in {fileName}</caption>
          <thead className="sticky top-0 bg-slate-50 text-slate-500">
            <tr>
              <th scope="col" className="px-2 py-1.5 font-medium">
                Segment
              </th>
              <th scope="col" className="px-2 py-1.5 font-medium">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.segmentId} className="border-t border-slate-100 align-top">
                <td className="px-2 py-1.5">
                  <span className="block font-medium text-slate-800">{row.name}</span>
                  <span className="block text-slate-500">
                    ID {row.segmentId}
                    {row.figures ? ` · ${row.figures}` : ''}
                  </span>
                  {row.changes ? (
                    <span className="block text-slate-500">Changes: {row.changes}</span>
                  ) : null}
                </td>
                <td className="px-2 py-1.5">
                  <span
                    className={`rounded px-1.5 py-0.5 font-medium ${STATUS_STYLES[row.status]}`}
                  >
                    {row.statusLabel}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onConfirm}
          disabled={saving}
          className="rounded-md bg-orange-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? 'Importing…' : 'Confirm import'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    </section>
  );
}

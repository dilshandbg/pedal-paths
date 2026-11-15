import { ConfirmAction } from '@/components/common/ConfirmAction';

interface SegmentDetailView {
  readonly segmentId: string;
  readonly name: string;
  readonly facts: readonly { readonly label: string; readonly value: string }[];
  readonly efforts: readonly {
    readonly key: string;
    readonly date: string;
    readonly elapsedTime: string;
    readonly movingTime: string;
    readonly isPersonalBest: boolean;
  }[];
  readonly personalBestNote: string | null;
}

interface SegmentDetailsProps {
  /** The formatted segment, or null while it loads or when it could not be loaded. */
  view: SegmentDetailView | null;
  status: 'loading' | 'ready' | 'failed';
  onBack: () => void;
  onRemove: (segmentId: string) => void;
}

/**
 * One segment's metadata and effort history with the personal best identified (BR-25, AC-26), and
 * its removal (BR-27). Presentational.
 */
export function SegmentDetails({ view, status, onBack, onRemove }: SegmentDetailsProps) {
  return (
    <section aria-label="Segment details" className="flex flex-col gap-3">
      <button
        type="button"
        onClick={onBack}
        className="self-start text-sm font-medium text-orange-700 hover:underline"
      >
        ← Back to segments
      </button>

      {status === 'loading' ? (
        <p role="status" className="text-sm text-slate-500">
          Loading segment…
        </p>
      ) : status === 'failed' || !view ? (
        <p role="alert" className="text-sm text-red-700">
          The segment could not be loaded.
        </p>
      ) : (
        <>
          <h3 className="text-base font-semibold text-slate-900">{view.name}</h3>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            {view.facts.map((fact) => (
              <div key={fact.label} className="contents">
                <dt className="text-slate-500">{fact.label}</dt>
                <dd className="text-slate-800 tabular-nums">{fact.value}</dd>
              </div>
            ))}
          </dl>

          <div className="flex flex-col gap-1">
            <h4 className="text-xs font-medium tracking-wide text-slate-600 uppercase">
              Effort history
            </h4>
            {view.personalBestNote ? (
              <p className="text-xs text-slate-500">{view.personalBestNote}</p>
            ) : null}
            {view.efforts.length === 0 ? (
              <p className="text-sm text-slate-500">No efforts stored for this segment.</p>
            ) : (
              <div className="max-h-72 overflow-auto rounded border border-slate-200">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">Efforts on {view.name}, fastest first</caption>
                  <thead className="sticky top-0 bg-slate-50 text-xs text-slate-500">
                    <tr>
                      <th scope="col" className="px-2 py-1.5 font-medium">
                        Date
                      </th>
                      <th scope="col" className="px-2 py-1.5 font-medium">
                        Elapsed
                      </th>
                      <th scope="col" className="px-2 py-1.5 font-medium">
                        Moving
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.efforts.map((effort) => (
                      <tr
                        key={effort.key}
                        className={`border-t border-slate-100 tabular-nums ${effort.isPersonalBest ? 'bg-amber-50 font-medium' : ''}`}
                      >
                        <td className="px-2 py-1.5">
                          {effort.date}
                          {effort.isPersonalBest ? (
                            <span className="ml-1.5 rounded bg-amber-200 px-1 text-xs text-amber-900">
                              ★ Personal best
                            </span>
                          ) : null}
                        </td>
                        <td className="px-2 py-1.5">{effort.elapsedTime}</td>
                        <td className="px-2 py-1.5">{effort.movingTime}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <ConfirmAction
            label="Remove segment"
            question={`Remove ${view.name} and its efforts from this device?`}
            confirmLabel="Remove"
            onConfirm={() => onRemove(view.segmentId)}
          />
        </>
      )}
    </section>
  );
}

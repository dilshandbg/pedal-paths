interface SegmentImportProblem {
  readonly location: string;
  readonly field: string | null;
  readonly message: string;
}

interface SegmentImportProblemsProps {
  fileName: string;
  problems: readonly SegmentImportProblem[];
  onDismiss: () => void;
}

/** Most problems listed; the rest are counted, so a broken file can't flood the page. */
export const MAX_LISTED_PROBLEMS = 50;

/**
 * Why a segment file was rejected (AC-21): every problem with its record and field. Nothing was
 * stored. Presentational.
 */
export function SegmentImportProblems({
  fileName,
  problems,
  onDismiss,
}: SegmentImportProblemsProps) {
  const listed = problems.slice(0, MAX_LISTED_PROBLEMS);
  const hidden = problems.length - listed.length;
  return (
    <div
      role="alert"
      className="flex flex-col gap-2 rounded-md border border-red-200 bg-red-50 p-3"
    >
      <p className="text-sm font-medium text-red-800">
        {fileName} was not imported. Nothing was stored. Fix{' '}
        {problems.length === 1
          ? 'this problem'
          : `these ${problems.length.toLocaleString('en-US')} problems`}{' '}
        and choose the file again:
      </p>
      <ul className="flex max-h-64 list-disc flex-col gap-1 overflow-y-auto pl-5 text-sm text-red-800">
        {listed.map((problem, index) => (
          <li key={`${problem.location}|${problem.field ?? ''}|${index}`}>
            <span className="font-medium">{problem.location}</span>
            {problem.field ? (
              <>
                , <code className="rounded bg-red-100 px-1 text-xs">{problem.field}</code>
              </>
            ) : null}
            : {problem.message}
          </li>
        ))}
      </ul>
      {hidden > 0 ? (
        <p className="text-sm text-red-800">…and {hidden.toLocaleString('en-US')} more.</p>
      ) : null}
      <button
        type="button"
        onClick={onDismiss}
        className="self-start rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm text-red-800 hover:bg-red-100"
      >
        Dismiss
      </button>
    </div>
  );
}

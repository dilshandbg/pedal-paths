import type { LoadedDataset } from '@/features/activities/store/activitiesStore';
import {
  IMPORT_FAILURE_MESSAGES,
  groupIssuesByReason,
  pluralize,
} from '@/features/activities/utils/importMessages';
import type { ImportStatus } from '@/types';

interface ImportStatusViewProps {
  status: ImportStatus;
  dataset: LoadedDataset | null;
  pendingFileName: string | null;
}

const MAX_LISTED_ISSUES = 20;

/** Import progress, errors and the loaded-data summary (UX-02, UX-03, UX-04, AC-16). */
export function ImportStatusView({ status, dataset, pendingFileName }: ImportStatusViewProps) {
  return (
    <div className="flex flex-col gap-3 text-sm">
      {status.stage === 'reading-archive' ? (
        <p role="status" className="text-slate-600">
          Reading {pendingFileName ?? 'archive'}…
        </p>
      ) : null}

      {status.stage === 'parsing-activities' ? (
        <div role="status" className="flex flex-col gap-1 text-slate-600">
          <span>
            Processing rides: {status.processed.toLocaleString('en-US')} of{' '}
            {status.total.toLocaleString('en-US')}
          </span>
          <progress
            aria-label="Import progress"
            value={status.processed}
            max={Math.max(status.total, 1)}
            className="h-2 w-full overflow-hidden rounded accent-orange-500"
          />
        </div>
      ) : null}

      {status.stage === 'indexing' ? (
        <p role="status" className="text-slate-600">
          Preparing heat map…
        </p>
      ) : null}

      {status.stage === 'failed' ? (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-red-800">
          <p className="font-medium">Could not load {pendingFileName ?? 'this file'}</p>
          <p className="mt-1">{IMPORT_FAILURE_MESSAGES[status.reason]}</p>
          {dataset ? (
            <p className="mt-1 text-red-700">Your previously loaded data is still shown.</p>
          ) : null}
        </div>
      ) : null}

      {dataset ? <DatasetSummary dataset={dataset} /> : null}
    </div>
  );
}

function DatasetSummary({ dataset }: { dataset: LoadedDataset }) {
  const groups = groupIssuesByReason(dataset.issues);
  const listed = dataset.issues.slice(0, MAX_LISTED_ISSUES);

  return (
    <section aria-label="Loaded data" className="flex flex-col gap-2">
      <p className="truncate text-xs text-slate-500" title={dataset.fileName}>
        {dataset.fileName}
      </p>
      <p className="text-base font-semibold text-slate-900">
        {pluralize(dataset.activities.length, 'ride')} loaded
      </p>
      {dataset.excludedNonRideCount > 0 ? (
        <p className="text-slate-500">
          {pluralize(dataset.excludedNonRideCount, 'non-ride activity', 'non-ride activities')}{' '}
          excluded
        </p>
      ) : null}

      {dataset.issues.length > 0 ? (
        <details className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900">
          <summary className="cursor-pointer font-medium">
            {pluralize(dataset.issues.length, 'ride')} could not be processed
          </summary>
          <ul className="mt-2 flex flex-col gap-1">
            {groups.map((group) => (
              <li key={group.reason}>
                {group.label}: {group.count.toLocaleString('en-US')}
              </li>
            ))}
          </ul>
          <ul aria-label="Rides not processed" className="mt-2 flex flex-col gap-0.5 text-xs">
            {listed.map((issue, index) => (
              <li key={`${issue.activityId ?? 'unknown'}-${index}`} className="truncate">
                {issue.activityName ?? issue.fileName ?? issue.activityId ?? 'Unknown activity'}
              </li>
            ))}
            {dataset.issues.length > listed.length ? (
              <li>…and {(dataset.issues.length - listed.length).toLocaleString('en-US')} more</li>
            ) : null}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

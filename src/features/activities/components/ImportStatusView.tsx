import type {
  HistoryAvailability,
  LoadedDataset,
} from '@/features/activities/store/activitiesStore';
import {
  HISTORY_UNAVAILABLE_MESSAGE,
  describeUploadFailure,
  groupIssuesByReason,
  pluralize,
} from '@/features/activities/utils/importMessages';
import type { ImportStatus, UploadRecord, UploadSummary } from '@/types';

interface ImportStatusViewProps {
  status: ImportStatus;
  dataset: LoadedDataset | null;
  history: HistoryAvailability;
  uploadCount: number;
  pendingFileName: string | null;
  lastUpload: UploadSummary | null;
  duplicateOf: UploadRecord | null;
}

const MAX_LISTED_ISSUES = 20;

/**
 * Upload progress, errors, the stored ride history and the latest upload's summary (UX-02,
 * UX-03, UX-04, AC-16, AC-41, BRD §10).
 */
export function ImportStatusView({
  status,
  dataset,
  history,
  uploadCount,
  pendingFileName,
  lastUpload,
  duplicateOf,
}: ImportStatusViewProps) {
  return (
    <div className="flex flex-col gap-3 text-sm">
      <ProgressMessage status={status} pendingFileName={pendingFileName} />
      {history === 'loading' && status.stage === 'idle' ? (
        <p role="status" className="text-slate-600">
          Loading your ride history…
        </p>
      ) : null}

      {status.stage === 'failed' ? (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-red-800">
          <p className="font-medium">Could not load {pendingFileName ?? 'this file'}</p>
          <p className="mt-1">{describeUploadFailure(status.reason, duplicateOf)}</p>
          {dataset ? <p className="mt-1 text-red-700">Your stored rides are still shown.</p> : null}
        </div>
      ) : history === 'unavailable' ? (
        <div
          role="alert"
          className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900"
        >
          {HISTORY_UNAVAILABLE_MESSAGE}
        </div>
      ) : null}

      {dataset ? (
        <section aria-label="Ride history" className="flex flex-col gap-0.5">
          <p className="text-base font-semibold text-slate-900">
            {pluralize(dataset.activities.length, 'ride')} stored
          </p>
          {uploadCount > 0 ? (
            <p className="text-slate-500">from {pluralize(uploadCount, 'upload')}</p>
          ) : null}
        </section>
      ) : null}

      {lastUpload ? <UploadSummaryView summary={lastUpload} /> : null}
    </div>
  );
}

function ProgressMessage({
  status,
  pendingFileName,
}: {
  status: ImportStatus;
  pendingFileName: string | null;
}) {
  switch (status.stage) {
    case 'reading-archive':
      return (
        <p role="status" className="text-slate-600">
          Reading {pendingFileName ?? 'archive'}…
        </p>
      );
    case 'parsing-activities':
      return (
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
      );
    case 'saving':
      return (
        <p role="status" className="text-slate-600">
          Saving rides…
        </p>
      );
    case 'loading-history':
      return (
        <p role="status" className="text-slate-600">
          Loading your ride history…
        </p>
      );
    case 'indexing':
      return (
        <p role="status" className="text-slate-600">
          Preparing heat map…
        </p>
      );
    default:
      return null;
  }
}

function UploadSummaryView({ summary }: { summary: UploadSummary }) {
  const { upload, issues } = summary;
  const groups = groupIssuesByReason(issues);
  const listed = issues.slice(0, MAX_LISTED_ISSUES);

  return (
    <section aria-label="Last upload" className="flex flex-col gap-2">
      <p className="truncate text-xs text-slate-500" title={upload.fileName}>
        {upload.fileName}
      </p>
      <p className="text-slate-900">
        {pluralize(upload.rideCount, 'ride')} in this file,{' '}
        {upload.newRideCount.toLocaleString('en-US')} new
      </p>
      {upload.excludedNonRideCount > 0 ? (
        <p className="text-slate-500">
          {pluralize(upload.excludedNonRideCount, 'non-ride activity', 'non-ride activities')}{' '}
          excluded
        </p>
      ) : null}

      {issues.length > 0 ? (
        <details className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900">
          <summary className="cursor-pointer font-medium">
            {pluralize(issues.length, 'ride')} could not be processed
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
            {issues.length > listed.length ? (
              <li>…and {(issues.length - listed.length).toLocaleString('en-US')} more</li>
            ) : null}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

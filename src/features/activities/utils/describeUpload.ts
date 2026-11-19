import { pluralize } from '@/features/activities/utils/importMessages';
import type { UploadDeletionResult, UploadRecord, UploadStatus } from '@/types';
import { formatDateTime } from '@/utils/date';
import { formatDistanceKm } from '@/utils/units';

/** Status names for the upload registry (BR-34). Words, not only colour (accessibility). */
export const UPLOAD_STATUS_LABELS: Readonly<Record<UploadStatus, string>> = {
  importing: 'Importing',
  complete: 'Complete',
  partial: 'Complete, some rides skipped',
  failed: 'Failed',
};

/** One row of the Uploads screen (BR-35, AC-36), ready to display. */
export interface UploadRow {
  readonly uploadId: string;
  readonly fileName: string;
  readonly uploadedAt: string;
  /** "3 rides (1 new)". */
  readonly rides: string;
  /** "123.4 km". */
  readonly distance: string;
  readonly status: UploadStatus;
  readonly statusLabel: string;
  /** Whether the status needs attention. The label says it in words too. */
  readonly statusTone: 'ok' | 'warning' | 'error';
}

const STATUS_TONES: Readonly<Record<UploadStatus, UploadRow['statusTone']>> = {
  importing: 'warning',
  complete: 'ok',
  partial: 'warning',
  failed: 'error',
};

/** Display text for one upload registry entry (BR-34, AC-36). */
// Implements: AC-36
export function describeUpload(upload: UploadRecord, timeZone?: string): UploadRow {
  return {
    uploadId: upload.uploadId,
    fileName: upload.fileName,
    uploadedAt: formatDateTime(upload.uploadedAt, timeZone),
    rides: `${pluralize(upload.rideCount, 'ride')} (${upload.newRideCount.toLocaleString('en-US')} new)`,
    distance: formatDistanceKm(upload.totalDistanceKm),
    status: upload.status,
    statusLabel: UPLOAD_STATUS_LABELS[upload.status],
    statusTone: STATUS_TONES[upload.status],
  };
}

/** Confirmation question for deleting the given uploads (BR-35, RULE-21). */
export function describeDeletionQuestion(fileNames: readonly string[]): string {
  const what =
    fileNames.length === 1 ? `“${fileNames[0] ?? ''}”` : pluralize(fileNames.length, 'upload');
  return `Delete ${what}? Rides that are only in ${fileNames.length === 1 ? 'this upload' : 'these uploads'} are removed from this device; rides that another upload also contains are kept.`;
}

/** What a finished deletion removed (BR-36). */
export function describeDeletionResult({ deletedUploads, deletedRides }: UploadDeletionResult) {
  return `Deleted ${pluralize(deletedUploads, 'upload')} and ${pluralize(deletedRides, 'ride')}.`;
}

/** Why uploads were not deleted; nothing was deleted (AC-40). */
export const DELETION_FAILURE_MESSAGES: Readonly<
  Record<'not-found' | 'history-unavailable' | 'delete-failed', string>
> = {
  'not-found':
    'One of the selected uploads no longer exists, so nothing was deleted. The list has been refreshed.',
  'history-unavailable':
    'The local ride storage is not available, so nothing was deleted. Start the app with “npm run dev” or “npm run preview” and try again.',
  'delete-failed': 'The uploads could not be deleted. Nothing was deleted. Try again.',
};

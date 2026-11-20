import type { ActivityId, CyclingActivity, RideSummary } from './activity';
import type { GeoBounds, SegmentIndex } from './heatmap';
import type { UploadRecord } from './rideHistory';

/** Why a single activity was skipped. Skips never abort the import (DATA-05, ADR-0004). */
export type ImportIssueReason =
  'missing-gps-file' | 'unsupported-format' | 'malformed-file' | 'no-usable-gps' | 'missing-date';

/** A non-fatal problem with one Ride activity, shown to the user (UX-04). */
export interface ImportIssue {
  readonly activityId: ActivityId | null;
  readonly activityName: string | null;
  /** Path of the GPS file inside the archive, when known. */
  readonly fileName: string | null;
  readonly reason: ImportIssueReason;
}

/** Why a whole archive was rejected (AC-16, AC-17). */
export type ImportFailureReason =
  'not-a-zip' | 'too-large' | 'corrupt-archive' | 'missing-activities-csv' | 'no-eligible-rides';

/**
 * Why an upload was not added to the ride history: the archive itself (AC-16, AC-17), a file
 * that was already imported (BR-37), or ride storage that is unavailable or failed (BRD §10).
 */
export type UploadFailureReason =
  ImportFailureReason | 'duplicate-file' | 'history-unavailable' | 'save-failed';

/** Outcome of processing one Strava export ZIP (ADR-0004). */
export type ImportResult =
  | {
      readonly ok: true;
      readonly activities: readonly CyclingActivity[];
      readonly issues: readonly ImportIssue[];
      /** Number of non-Ride activities excluded by classification (BR-04). */
      readonly excludedNonRideCount: number;
    }
  | {
      readonly ok: false;
      readonly reason: ImportFailureReason;
    };

/**
 * A processed export, ready to store (ADR-0013 §4): its rides as a ride bundle for
 * `POST /api/uploads`, its file hash, and what the user is told about it.
 */
export type ArchiveUploadResult =
  | {
      readonly ok: true;
      /** The `POST /api/uploads` body: upload details and every ride with its encoded track. */
      readonly bundle: Uint8Array;
      readonly fileHash: string;
      readonly rideCount: number;
      readonly issues: readonly ImportIssue[];
      readonly excludedNonRideCount: number;
    }
  | {
      readonly ok: false;
      readonly reason: ImportFailureReason;
    };

/** The stored ride history, decoded and indexed for the heat map (BR-33, ADR-0006). */
export interface RestoredHistory {
  /** The stored rides without their tracks: the page never needs the points (NFR-10). */
  readonly activities: readonly RideSummary[];
  /** Bounding box of every stored track point, to fit the map; null when there are none. */
  readonly bounds: GeoBounds | null;
  /** Road-segment index over all `activities`, built in the import worker (ADR-0006). */
  readonly segmentIndex: SegmentIndex;
  /** Stored rides that could not be shown (an unreadable entry); normally 0. */
  readonly skippedCount: number;
}

/** What the user is told about the latest upload of this session (UX-03, UX-04). */
export interface UploadSummary {
  readonly upload: UploadRecord;
  readonly issues: readonly ImportIssue[];
}

/** Progress reported while an archive is processed and stored, or the history loads (UX-02). */
export type ImportStatus =
  | { readonly stage: 'idle' }
  | { readonly stage: 'reading-archive' }
  | { readonly stage: 'parsing-activities'; readonly processed: number; readonly total: number }
  | { readonly stage: 'saving' }
  | { readonly stage: 'loading-history' }
  | { readonly stage: 'indexing' }
  | { readonly stage: 'done' }
  | { readonly stage: 'failed'; readonly reason: UploadFailureReason };

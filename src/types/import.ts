import type { ActivityId, CyclingActivity } from './activity';
import type { SegmentIndex } from './heatmap';

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

/** Outcome of processing one Strava export ZIP. */
export type ImportResult =
  | {
      readonly ok: true;
      readonly activities: readonly CyclingActivity[];
      readonly issues: readonly ImportIssue[];
      /** Number of non-Ride activities excluded by classification (BR-04). */
      readonly excludedNonRideCount: number;
      /** Road-segment index for the heat map, precomputed in the import worker (ADR-0006). */
      readonly segmentIndex: SegmentIndex;
    }
  | {
      readonly ok: false;
      readonly reason: ImportFailureReason;
    };

/** Progress reported while an archive is processed (UX-02). */
export type ImportStatus =
  | { readonly stage: 'idle' }
  | { readonly stage: 'reading-archive' }
  | { readonly stage: 'parsing-activities'; readonly processed: number; readonly total: number }
  | { readonly stage: 'indexing' }
  | { readonly stage: 'done' }
  | { readonly stage: 'failed'; readonly reason: ImportFailureReason };

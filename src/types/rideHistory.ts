import type { ActivityId } from './activity';
import type { SegmentApiErrorCode } from './segment';

/*
 * Stored ride history and upload registry (BRD v2.3: BR-33 – BR-37, ADR-0013). The local backend
 * keeps them in a SQLite database; the browser only sees these shapes through `/api/uploads` and
 * `/api/rides`.
 */

/** Random UUID that identifies one upload in the registry (BR-34). */
export type UploadId = string;

/**
 * Import status of an upload (BR-34): `partial` = completed with skipped Ride activities;
 * `importing` is only seen while an upload is being stored, or after a crash until restart.
 */
export type UploadStatus = 'importing' | 'complete' | 'partial' | 'failed';

/** One entry of the upload registry (BR-34). */
export interface UploadRecord {
  readonly uploadId: UploadId;
  /** Original file name, as the user selected it. */
  readonly fileName: string;
  readonly fileSizeBytes: number;
  /** SHA-256 of the whole file, lowercase hex (RULE-23). */
  readonly fileHash: string;
  /** When the upload was recorded, ISO 8601 UTC. */
  readonly uploadedAt: string;
  readonly status: UploadStatus;
  /** Ride activities with a usable GPS track in this file, including ones already stored. */
  readonly rideCount: number;
  /** Of `rideCount`, rides that were not stored before this upload. */
  readonly newRideCount: number;
  /** Total distance of the file's rides, known distances only (RULE-13). */
  readonly totalDistanceKm: number;
  /** Ride activities of this file that could not be read. */
  readonly skippedCount: number;
  /** Non-Ride activities of this file (BR-04). */
  readonly excludedNonRideCount: number;
}

/** What the browser reports about a new upload, besides its rides. */
export interface NewUpload {
  readonly fileName: string;
  readonly fileSizeBytes: number;
  readonly fileHash: string;
  readonly skippedCount: number;
  readonly excludedNonRideCount: number;
}

/** A stored ride's details, without its track. Names match `CyclingActivity`. */
export interface StoredRideDetails {
  readonly activityId: ActivityId;
  readonly activityName: string;
  /** Start date-time, ISO 8601 UTC. */
  readonly activityDate: string;
  readonly distanceKm: number | null;
  readonly elevationGainM: number | null;
  readonly movingTimeS: number | null;
}

/** A ride with its GPS track encoded by `encodeTrack` (ADR-0013 §3). */
export interface EncodedRide {
  readonly details: StoredRideDetails;
  readonly track: Uint8Array;
}

/** Result of deleting uploads (BR-36). */
export interface UploadDeletionResult {
  readonly deletedUploads: number;
  /** Rides removed because no remaining upload contains them (RULE-21). */
  readonly deletedRides: number;
}

/** Error codes of the ride history API: the segment API's, plus a duplicate file (BR-37). */
export type RideHistoryApiErrorCode = SegmentApiErrorCode | 'duplicate-file';

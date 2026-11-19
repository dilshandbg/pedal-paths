import type { GPSPoint } from '../../src/types/activity';
import type { NewUpload, StoredRideDetails } from '../../src/types/rideHistory';
import { isIsoDateTime } from '../../src/features/segments/services/segmentRules';
import { decodeRideBundle, RideBundleError } from '../../src/services/ride-history/rideBundle';
import { decodeTrack, TrackFormatError } from '../../src/services/ride-history/trackCodec';

/*
 * Validates a `POST /api/uploads` body independently of the UI (NFR-08). Everything the backend
 * stores passes through here: registry details, ride details and decodable tracks.
 */

/** A ride ready to store: checked details, the track bytes as received and the decoded points. */
export interface ValidRide {
  readonly details: StoredRideDetails;
  readonly track: Uint8Array;
  readonly points: readonly GPSPoint[];
}

export interface ValidUpload {
  readonly upload: NewUpload;
  readonly rides: readonly ValidRide[];
}

export type UploadValidation =
  | { readonly ok: true; readonly value: ValidUpload }
  | { readonly ok: false; readonly problems: readonly string[] };

export const UPLOAD_LIMITS = {
  fileNameLength: 255,
  activityIdLength: 64,
  activityNameLength: 1000,
  rides: 100_000,
  /** At most this many problems are reported, so a broken file gets a readable answer. */
  reportedProblems: 100,
} as const;

// eslint-disable-next-line no-control-regex -- control characters are exactly what is rejected
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const SHA256_HEX = /^[0-9a-f]{64}$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

const isText = (value: unknown, maxLength: number): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= maxLength &&
  !CONTROL_CHARACTERS.test(value);

const isOptionalAmount = (value: unknown): value is number | null =>
  value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0);

function validateMeta(meta: unknown, problems: string[]): NewUpload | null {
  const upload = isRecord(meta) ? meta.upload : undefined;
  if (!isRecord(upload)) {
    problems.push('meta.upload is missing.');
    return null;
  }
  const { fileName, fileSizeBytes, fileHash, skippedCount, excludedNonRideCount } = upload;
  const before = problems.length;
  if (!isText(fileName, UPLOAD_LIMITS.fileNameLength)) {
    problems.push(`upload.fileName must be 1–${UPLOAD_LIMITS.fileNameLength} printable characters.`);
  }
  if (!isCount(fileSizeBytes)) problems.push('upload.fileSizeBytes must be a whole number ≥ 0.');
  if (typeof fileHash !== 'string' || !SHA256_HEX.test(fileHash)) {
    problems.push('upload.fileHash must be a lowercase hex SHA-256.');
  }
  if (!isCount(skippedCount)) problems.push('upload.skippedCount must be a whole number ≥ 0.');
  if (!isCount(excludedNonRideCount)) {
    problems.push('upload.excludedNonRideCount must be a whole number ≥ 0.');
  }
  if (problems.length > before) return null;
  return {
    fileName: fileName as string,
    fileSizeBytes: fileSizeBytes as number,
    fileHash: fileHash as string,
    skippedCount: skippedCount as number,
    excludedNonRideCount: excludedNonRideCount as number,
  };
}

function validateDetails(
  details: unknown,
  at: string,
  problems: string[],
): StoredRideDetails | null {
  if (!isRecord(details)) {
    problems.push(`${at} is not an object.`);
    return null;
  }
  const { activityId, activityName, activityDate, distanceKm, elevationGainM, movingTimeS } =
    details;
  const before = problems.length;
  if (!isText(activityId, UPLOAD_LIMITS.activityIdLength)) {
    problems.push(`${at}.activityId must be 1–${UPLOAD_LIMITS.activityIdLength} printable characters.`);
  }
  if (!isText(activityName, UPLOAD_LIMITS.activityNameLength)) {
    problems.push(`${at}.activityName must be 1–${UPLOAD_LIMITS.activityNameLength} printable characters.`);
  }
  if (typeof activityDate !== 'string' || !isIsoDateTime(activityDate)) {
    problems.push(`${at}.activityDate must be an ISO 8601 date-time.`);
  }
  for (const [name, value] of [
    ['distanceKm', distanceKm],
    ['elevationGainM', elevationGainM],
    ['movingTimeS', movingTimeS],
  ] as const) {
    if (!isOptionalAmount(value)) problems.push(`${at}.${name} must be null or a number ≥ 0.`);
  }
  if (problems.length > before) return null;
  return {
    activityId: activityId as string,
    activityName: activityName as string,
    activityDate: new Date(activityDate as string).toISOString(),
    distanceKm: distanceKm as number | null,
    elevationGainM: elevationGainM as number | null,
    movingTimeS: movingTimeS as number | null,
  };
}

/** Checks a ride bundle; reports every problem found, or the upload ready to store. */
export function validateUploadBundle(bytes: Uint8Array): UploadValidation {
  let bundle;
  try {
    bundle = decodeRideBundle(bytes);
  } catch (error) {
    if (error instanceof RideBundleError) return { ok: false, problems: [error.message] };
    throw error;
  }

  const problems: string[] = [];
  const upload = validateMeta(bundle.meta, problems);
  if (bundle.rides.length === 0) problems.push('An upload needs at least one ride.');
  if (bundle.rides.length > UPLOAD_LIMITS.rides) {
    problems.push(`An upload holds at most ${UPLOAD_LIMITS.rides} rides.`);
    return { ok: false, problems };
  }

  const rides: ValidRide[] = [];
  bundle.rides.forEach((ride, index) => {
    const at = `rides[${index}]`;
    const details = validateDetails(ride.details, at, problems);
    let points: GPSPoint[] | null = null;
    try {
      points = decodeTrack(ride.track);
      if (points.length < 2) {
        problems.push(`${at} track needs at least 2 points.`);
        points = null;
      }
    } catch (error) {
      if (!(error instanceof TrackFormatError)) throw error;
      problems.push(`${at} track: ${error.message}`);
    }
    if (details && points) rides.push({ details, track: ride.track, points });
  });

  if (problems.length > 0 || upload === null) {
    return { ok: false, problems: problems.slice(0, UPLOAD_LIMITS.reportedProblems) };
  }
  return { ok: true, value: { upload, rides } };
}

import type { GPSPoint } from '../../src/types/activity';
import type { NewUpload, StoredRideDetails } from '../../src/types/rideHistory';
import { encodeRideBundle } from '../../src/services/ride-history/rideBundle';
import { encodeTrack } from '../../src/services/ride-history/trackCodec';
import type { ValidRide, ValidUpload } from '../../server/rides/validateUpload';

/* SYNTHETIC ride history data for backend tests. Not real GPS data. */

/** Rounds to the 10⁻⁷° the track encoding keeps, so encoded tracks round-trip exactly. */
const onGrid = (degrees: number) => Math.round(degrees * 1e7) / 1e7;

/** A straight track of `count` points heading north from a start, ~11 m apart. */
export function track(startLatitude = 10, longitude = 20, count = 5): GPSPoint[] {
  return Array.from({ length: count }, (_, i) => ({
    latitude: onGrid(startLatitude + i * 0.0001),
    longitude,
    elevation: 100 + i,
    timestamp: new Date(Date.UTC(2024, 2, 10, 7, 0, i * 5)).toISOString(),
  }));
}

export const details = (
  activityId: string,
  patch: Partial<StoredRideDetails> = {},
): StoredRideDetails => ({
  activityId,
  activityName: `Synthetic ride ${activityId}`,
  activityDate: '2024-03-10T07:00:00.000Z',
  distanceKm: 10,
  elevationGainM: 50,
  movingTimeS: 1800,
  ...patch,
});

export function ride(
  activityId: string,
  patch: Partial<StoredRideDetails> = {},
  points: GPSPoint[] = track(10 + Number(activityId) * 0.01),
): ValidRide {
  return { details: details(activityId, patch), track: encodeTrack(points), points };
}

/** A distinct, valid SHA-256-shaped hash per number. */
export const hash = (n: number) => n.toString(16).padStart(64, '0');

export const newUpload = (n: number, patch: Partial<NewUpload> = {}): NewUpload => ({
  fileName: `export_${n}.zip`,
  fileSizeBytes: 1000 + n,
  fileHash: hash(n),
  skippedCount: 0,
  excludedNonRideCount: 0,
  ...patch,
});

export const upload = (
  n: number,
  rides: ValidRide[],
  patch: Partial<NewUpload> = {},
): ValidUpload => ({
  upload: newUpload(n, patch),
  rides,
});

/** The `POST /api/uploads` body for an upload. */
export const uploadBody = ({ upload: meta, rides }: ValidUpload): Uint8Array =>
  encodeRideBundle(
    { upload: meta },
    rides.map(({ details: d, track: t }) => ({ details: d, track: t })),
  );

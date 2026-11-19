import { MIN_TRACK_POINTS } from '@/features/activities/services/normalizeActivity';
import { decodeRideBundle, encodeRideBundle } from '@/services/ride-history/rideBundle';
import { decodeTrack, encodeTrack } from '@/services/ride-history/trackCodec';
import type { CyclingActivity, NewUpload, StoredRideDetails } from '@/types';
import { getYearMonth } from '@/utils/date';

/*
 * Converts between the app's rides and the ride bundles of the local ride history API
 * (ADR-0013 §4): an upload is sent as one bundle, and the stored history comes back as one.
 */

/** The `POST /api/uploads` body for an export's rides (BR-33). */
export function encodeUploadBundle(
  upload: NewUpload,
  activities: readonly CyclingActivity[],
): Uint8Array {
  return encodeRideBundle(
    { upload },
    activities.map((activity) => ({
      details: {
        activityId: activity.activityId,
        activityName: activity.activityName,
        activityDate: activity.activityDate,
        distanceKm: activity.distanceKm,
        elevationGainM: activity.elevationGainM,
        movingTimeS: activity.movingTimeS,
      },
      track: encodeTrack(activity.gpsTrack),
    })),
  );
}

export interface DecodedRideHistory {
  /** Stored rides, newest first (the order an import uses). */
  readonly activities: CyclingActivity[];
  /** Entries that could not be shown: invalid details or track. */
  readonly skippedCount: number;
}

const isAmount = (value: unknown): value is number | null =>
  value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0);

function readDetails(details: unknown): StoredRideDetails | null {
  if (typeof details !== 'object' || details === null) return null;
  const d = details as Record<string, unknown>;
  if (
    typeof d.activityId !== 'string' ||
    d.activityId === '' ||
    typeof d.activityName !== 'string' ||
    typeof d.activityDate !== 'string' ||
    !isAmount(d.distanceKm) ||
    !isAmount(d.elevationGainM) ||
    !isAmount(d.movingTimeS)
  ) {
    return null;
  }
  return {
    activityId: d.activityId,
    activityName: d.activityName,
    activityDate: d.activityDate,
    distanceKm: d.distanceKm,
    elevationGainM: d.elevationGainM,
    movingTimeS: d.movingTimeS,
  };
}

/**
 * Turns `GET /api/rides` into rides (BR-33, AC-34). Year and month come from the start date in the
 * browser's time zone, as for an import (ADR-0007). An entry that cannot be shown is counted and
 * skipped, never fatal.
 *
 * @throws RideBundleError when the response is not a ride bundle at all.
 */
// Implements: BR-33
export function decodeRideHistory(
  bytes: Uint8Array,
  options: { readonly timeZone?: string } = {},
): DecodedRideHistory {
  const bundle = decodeRideBundle(bytes);
  const activities: CyclingActivity[] = [];
  const seen = new Set<string>();
  let skippedCount = 0;

  for (const ride of bundle.rides) {
    const details = readDetails(ride.details);
    const yearMonth = details ? getYearMonth(details.activityDate, options.timeZone) : null;
    let gpsTrack: CyclingActivity['gpsTrack'] | null = null;
    try {
      gpsTrack = decodeTrack(ride.track);
    } catch {
      gpsTrack = null;
    }
    if (
      !details ||
      !yearMonth ||
      !gpsTrack ||
      gpsTrack.length < MIN_TRACK_POINTS ||
      seen.has(details.activityId)
    ) {
      skippedCount += 1;
      continue;
    }
    seen.add(details.activityId);
    activities.push({ ...details, year: yearMonth.year, month: yearMonth.month, gpsTrack });
  }

  activities.sort((a, b) => b.activityDate.localeCompare(a.activityDate));
  return { activities, skippedCount };
}

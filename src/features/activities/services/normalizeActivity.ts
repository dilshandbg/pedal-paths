import { trackDistanceKm, trackElevationGainM } from '@/features/activities/utils/trackMetrics';
import type { ParsedTrack } from '@/services/gpx/parseGpx';
import { parseStravaDate, type ActivityCsvRow } from '@/services/strava-export/activitiesCsv';
import type { CyclingActivity, ImportIssue } from '@/types';
import { getYearMonth } from '@/utils/date';

export const UNTITLED_RIDE_NAME = 'Untitled ride';

/** Minimum number of valid points for a track to be drawn (ADR-0007). */
export const MIN_TRACK_POINTS = 2;

export type NormalizeResult =
  | { readonly ok: true; readonly activity: CyclingActivity }
  | { readonly ok: false; readonly issue: ImportIssue };

export interface NormalizeOptions {
  /** IANA zone used to derive year/month. Defaults to the runtime's local zone (ADR-0007). */
  readonly timeZone?: string;
}

const roundTo = (value: number, decimals: number) => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

/**
 * Combines a Ride's `activities.csv` row with its parsed GPS track into a `CyclingActivity`
 * (DATA-03, ADR-0007). Returns an `ImportIssue` instead when the ride can't be shown (RULE-07).
 *
 * - Date: CSV `Activity Date`, else the track start time, else `missing-date`.
 * - Distance and elevation gain: the CSV values (Strava's own), else computed from the track.
 * - Name: CSV name, else the track name, else "Untitled ride".
 */
// Implements: DATA-03, DATA-05, RULE-07
export function normalizeActivity(
  row: ActivityCsvRow,
  track: ParsedTrack,
  options: NormalizeOptions = {},
): NormalizeResult {
  const activityName = row.activityName || track.name || UNTITLED_RIDE_NAME;
  const issue = (reason: ImportIssue['reason']): NormalizeResult => ({
    ok: false,
    issue: {
      activityId: row.activityId || null,
      activityName,
      fileName: row.fileName || null,
      reason,
    },
  });

  if (track.points.length < MIN_TRACK_POINTS) {
    return issue('no-usable-gps');
  }

  const activityDate = parseStravaDate(row.activityDate) ?? track.startTime;
  const yearMonth = activityDate === null ? null : getYearMonth(activityDate, options.timeZone);
  if (activityDate === null || yearMonth === null) {
    return issue('missing-date');
  }

  const distanceKm =
    row.distanceMetres === null ? trackDistanceKm(track.points) : row.distanceMetres / 1000;
  const elevationGainM = row.elevationGainMetres ?? trackElevationGainM(track.points);

  return {
    ok: true,
    activity: {
      activityId: row.activityId,
      activityName,
      activityDate,
      year: yearMonth.year,
      month: yearMonth.month,
      distanceKm: roundTo(distanceKm, 3),
      elevationGainM: elevationGainM === null ? null : roundTo(elevationGainM, 1),
      // Strava's own value only: its moving-time rules are not published, so no track estimate.
      movingTimeS:
        row.movingTimeSeconds === null || row.movingTimeSeconds < 0
          ? null
          : Math.round(row.movingTimeSeconds),
      gpsTrack: track.points,
    },
  };
}

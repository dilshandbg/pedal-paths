/**
 * Core activity domain types.
 *
 * Status: ACCEPTED, validated against docs/BRD.md v1.1.
 * Rules: docs/decisions/0007-activity-normalization-rules.md
 */

/** Strava's activity ID, from the `Activity ID` column of `activities.csv` (ADR-0007). */
export type ActivityId = string;

/** Calendar month, 1 = January … 12 = December. */
export type Month = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

/** A single recorded GPS sample from a GPX `<trkpt>` or a FIT `record` message. */
export interface GPSPoint {
  /** WGS84 latitude in decimal degrees, -90..90. */
  readonly latitude: number;
  /** WGS84 longitude in decimal degrees, -180..180. */
  readonly longitude: number;
  /** Elevation in metres, or null when the device did not record it. */
  readonly elevation: number | null;
  /** ISO 8601 UTC timestamp, or null when absent. */
  readonly timestamp: string | null;
}

/**
 * A normalized Ride activity (BR-03, DATA-03), independent of its source format (GPX/FIT).
 * Only activities classified as Ride with a usable GPS track become a `CyclingActivity`.
 */
export interface CyclingActivity {
  readonly activityId: ActivityId;
  /** Strava activity name, or a fallback display name when it is missing. */
  readonly activityName: string;
  /** Activity start date-time as a UTC ISO 8601 string. */
  readonly activityDate: string;
  /** Calendar year of `activityDate` in the browser's local time zone (ADR-0007). */
  readonly year: number;
  /** Calendar month of `activityDate` in the browser's local time zone (ADR-0007). */
  readonly month: Month;
  /** Distance in km, or null when neither the export nor the track can provide it (BR-13). */
  readonly distanceKm: number | null;
  /** Elevation gain in metres, or null when not available (BR-13). */
  readonly elevationGainM: number | null;
  /** Moving time in seconds from the export, or null when not available (BR-19). */
  readonly movingTimeS: number | null;
  /** Ordered track points; contains at least 2 valid points. */
  readonly gpsTrack: readonly GPSPoint[];
}

/**
 * A ride without its GPS track: what the screen needs once the heat map index is built (filters,
 * statistics, the ride list). Restoring a large history sends only this to the page (NFR-10).
 */
export type RideSummary = Omit<CyclingActivity, 'gpsTrack'>;

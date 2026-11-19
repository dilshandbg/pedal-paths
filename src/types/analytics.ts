import type { ActivityId, GPSPoint, Month } from './activity';
import type { GeoBounds } from './heatmap';

/*
 * Deterministic ride analytics over the stored ride history (BR-38, RULE-24, ADR-0013 §7). The
 * same inputs always give the same output: results are computed from stored data only, never
 * estimated, and a missing value follows RULE-13 (it is not counted in a total).
 */

/**
 * Calendar dates, inclusive, as `YYYY-MM-DD` in the history's time zone (the machine's, as for
 * the year and month filters, ADR-0007). Either end may be open.
 */
export interface DateRange {
  readonly from: string | null;
  readonly to: string | null;
}

/** A stored ride's details, as the analytics see them. */
export interface AnalyticsRide {
  readonly activityId: ActivityId;
  readonly activityName: string;
  /** Start, ISO 8601 UTC. */
  readonly activityDate: string;
  readonly distanceKm: number | null;
  readonly elevationGainM: number | null;
  readonly movingTimeS: number | null;
}

/** A ride with its GPS track, for location analytics. */
export interface AnalyticsTrack extends AnalyticsRide {
  readonly points: readonly GPSPoint[];
}

/** Totals over a set of rides. Each total covers only rides where the value is known (RULE-13). */
export interface RideTotals {
  readonly rideCount: number;
  readonly distanceKm: number;
  readonly elevationGainM: number;
  readonly movingTimeS: number;
  /** Rides whose distance is not known, so not in `distanceKm`. */
  readonly ridesWithoutDistance: number;
}

export interface MonthTotals extends RideTotals {
  readonly year: number;
  readonly month: Month;
}

export interface YearTotals extends RideTotals {
  readonly year: number;
}

/** A place, a radius and an optional date range (RULE-24: default radius 100 m). */
export interface LocationQuery {
  readonly latitude: number;
  readonly longitude: number;
  readonly radiusM: number;
  readonly range: DateRange;
}

/** Distinct rides that passed within the radius of a place (BR-38, RULE-24). */
export interface LocationVisits {
  readonly latitude: number;
  readonly longitude: number;
  readonly radiusM: number;
  readonly visitCount: number;
  /** The visiting rides, oldest first, with how close each came, in metres. */
  readonly rides: readonly {
    readonly activityId: ActivityId;
    readonly activityName: string;
    readonly activityDate: string;
    readonly closestM: number;
  }[];
}

/** How many distinct rides used one ~100 m piece of road (a 0.001° grid cell, ADR-0013 §5). */
export interface RoadFrequency {
  /** Centre of the grid cell. */
  readonly latitude: number;
  readonly longitude: number;
  readonly rideCount: number;
}

export interface RouteFrequencyQuery {
  readonly bounds: GeoBounds;
  readonly limit: number;
  readonly range: DateRange;
}

/** What two periods can be compared on (BR-38). */
export type ComparisonMetric =
  'distanceKm' | 'rideCount' | 'elevationGainM' | 'movingTimeS' | 'locationVisits';

export interface PeriodComparison {
  readonly metric: ComparisonMetric;
  readonly periodA: DateRange & { readonly value: number };
  readonly periodB: DateRange & { readonly value: number };
  /** `periodB.value − periodA.value`. */
  readonly difference: number;
  /** The difference as a percentage of period A, or null when period A is 0. */
  readonly percentChange: number | null;
}

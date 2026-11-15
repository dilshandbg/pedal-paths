/**
 * Summary statistics for the currently filtered Ride activities (BR-14, BR-19, UX-08, ADR-0007).
 * A ride with an unknown value counts as a ride but is left out of that value's total (RULE-13).
 */
export interface ActivitySummary {
  /** Number of activities matching the active filters (BR-14, AC-13). */
  readonly activityCount: number;
  readonly totalDistanceKm: number;
  readonly totalElevationGainM: number;
  /** Total moving time in seconds, or null when no filtered ride has one (BR-19). */
  readonly totalMovingTimeS: number | null;
  /** Mean distance of the rides with a known distance, or null when none has one (BR-19). */
  readonly averageDistanceKm: number | null;
}

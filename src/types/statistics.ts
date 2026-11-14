/**
 * Summary statistics for the currently filtered Ride activities (BR-14, UX-08, ADR-0007).
 * Activities with an unknown distance or elevation gain are left out of that total.
 */
export interface ActivitySummary {
  /** Number of activities matching the active filters (BR-14, AC-13). */
  readonly activityCount: number;
  readonly totalDistanceKm: number;
  readonly totalElevationGainM: number;
}

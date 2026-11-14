import type { ActivityId, Month } from './activity';

/**
 * The user's current activity selection. Semantics are defined in ADR-0005:
 * - `selectedYears` / `selectedMonths`: opt-in. Empty means unrestricted (RULE-09). Years and
 *   months combine as a Cartesian AND (AC-10).
 * - `excludedActivityIds`: opt-out. Every ride is included unless it is excluded here (AC-09).
 */
export interface ActivityFilter {
  readonly selectedYears: readonly number[];
  readonly selectedMonths: readonly Month[];
  readonly excludedActivityIds: readonly ActivityId[];
}

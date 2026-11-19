import type { AnalyticsRide, DateRange, MonthTotals, RideTotals, YearTotals } from '@/types';
import { getYearMonth } from '../../../utils/date';
import { ALL_TIME, startedInRange } from './dateRange';

/*
 * Distance and other totals by month and by year (BR-38, RULE-24). Totals use only known values
 * (RULE-13); a ride without a distance still counts as a ride and is reported in
 * `ridesWithoutDistance`. Sums are rounded once, at the end (distance to the metre, elevation to
 * 0.1 m, time to the second), and the backend always passes rides in the same order (by start), so
 * the same history always gives the same numbers.
 *
 * Only relative and type-only imports: the local backend loads this file without the `@/` alias.
 */

const round = (value: number, decimals: number) => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

interface Accumulator {
  rideCount: number;
  distanceKm: number;
  elevationGainM: number;
  movingTimeS: number;
  ridesWithoutDistance: number;
}

const empty = (): Accumulator => ({
  rideCount: 0,
  distanceKm: 0,
  elevationGainM: 0,
  movingTimeS: 0,
  ridesWithoutDistance: 0,
});

function add(total: Accumulator, ride: AnalyticsRide): void {
  total.rideCount += 1;
  if (ride.distanceKm === null) total.ridesWithoutDistance += 1;
  else total.distanceKm += ride.distanceKm;
  total.elevationGainM += ride.elevationGainM ?? 0;
  total.movingTimeS += ride.movingTimeS ?? 0;
}

const finish = (total: Accumulator): RideTotals => ({
  rideCount: total.rideCount,
  distanceKm: round(total.distanceKm, 3),
  elevationGainM: round(total.elevationGainM, 1),
  movingTimeS: Math.round(total.movingTimeS),
  ridesWithoutDistance: total.ridesWithoutDistance,
});

/** Totals of the rides that started in the range. */
// Implements: BR-38
export function totalRides(
  rides: readonly AnalyticsRide[],
  range: DateRange = ALL_TIME,
  timeZone?: string,
): RideTotals {
  const total = empty();
  for (const ride of rides) {
    if (startedInRange(ride.activityDate, range, timeZone)) add(total, ride);
  }
  return finish(total);
}

/** Totals per calendar month with at least one ride in the range, oldest first (BR-38). */
// Implements: BR-38, AC-42
export function distanceByMonth(
  rides: readonly AnalyticsRide[],
  range: DateRange = ALL_TIME,
  timeZone?: string,
): MonthTotals[] {
  const months = new Map<
    number,
    { year: number; month: MonthTotals['month']; total: Accumulator }
  >();
  for (const ride of rides) {
    if (!startedInRange(ride.activityDate, range, timeZone)) continue;
    const yearMonth = getYearMonth(ride.activityDate, timeZone);
    if (!yearMonth) continue;
    const key = yearMonth.year * 100 + yearMonth.month;
    let entry = months.get(key);
    if (!entry) {
      entry = { ...yearMonth, total: empty() };
      months.set(key, entry);
    }
    add(entry.total, ride);
  }
  return [...months.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, { year, month, total }]) => ({ year, month, ...finish(total) }));
}

/** Totals per calendar year with at least one ride in the range, oldest first (BR-38). */
// Implements: BR-38, AC-42
export function distanceByYear(
  rides: readonly AnalyticsRide[],
  range: DateRange = ALL_TIME,
  timeZone?: string,
): YearTotals[] {
  const years = new Map<number, Accumulator>();
  for (const ride of rides) {
    if (!startedInRange(ride.activityDate, range, timeZone)) continue;
    const yearMonth = getYearMonth(ride.activityDate, timeZone);
    if (!yearMonth) continue;
    let total = years.get(yearMonth.year);
    if (!total) {
      total = empty();
      years.set(yearMonth.year, total);
    }
    add(total, ride);
  }
  return [...years.entries()]
    .sort(([a], [b]) => a - b)
    .map(([year, total]) => ({ year, ...finish(total) }));
}

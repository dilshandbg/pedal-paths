import type { ComparisonMetric, DateRange, PeriodComparison } from '@/types';

/*
 * Comparison of two periods on one metric (BR-38). The values come from the other analytics
 * functions (`totalRides`, `countLocationVisits`), passed in as `measure`, so a comparison is
 * exactly the difference of two results the user could also ask for separately.
 *
 * Only relative and type-only imports: the local backend loads this file without the `@/` alias.
 */

/** Compares `measure(periodB)` with `measure(periodA)`. */
// Implements: BR-38, AC-42
export function comparePeriods(
  metric: ComparisonMetric,
  periodA: DateRange,
  periodB: DateRange,
  measure: (range: DateRange) => number,
): PeriodComparison {
  const a = measure(periodA);
  const b = measure(periodB);
  const difference = Math.round((b - a) * 1000) / 1000;
  return {
    metric,
    periodA: { ...periodA, value: a },
    periodB: { ...periodB, value: b },
    difference,
    percentChange: a === 0 ? null : Math.round((difference / a) * 1000) / 10,
  };
}

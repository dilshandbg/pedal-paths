import { describe, expect, it } from 'vitest';
import { EMPTY_ACTIVITY_FILTER } from '@/features/filters/store/filterStore';
import { describeActiveFilters } from '@/features/filters/utils/describeActiveFilters';
import type { ActivityFilter } from '@/types';

const describeFilter = (patch: Partial<ActivityFilter>) =>
  Object.fromEntries(
    describeActiveFilters({ ...EMPTY_ACTIVITY_FILTER, ...patch }).map((item) => [
      item.label,
      item.value,
    ]),
  );

describe('BR-11 / UX-06: active filters summary', () => {
  it('RULE-09: an unrestricted filter reads as all years, months and rides', () => {
    expect(describeFilter({})).toEqual({
      Years: 'All years',
      Months: 'All months',
      Rides: 'All rides',
    });
  });

  it('lists the selected years newest first and the months in calendar order', () => {
    const summary = describeFilter({ selectedYears: [2022, 2024], selectedMonths: [12, 1, 6] });
    expect(summary.Years).toBe('2024, 2022');
    expect(summary.Months).toBe('January, June, December');
  });

  it('counts deselected rides, with singular and plural wording', () => {
    expect(describeFilter({ excludedActivityIds: ['a'] }).Rides).toBe('1 ride deselected');
    expect(describeFilter({ excludedActivityIds: ['a', 'b'] }).Rides).toBe('2 rides deselected');
  });

  it('counts a ride ID once even if it appears twice', () => {
    expect(describeFilter({ excludedActivityIds: ['a', 'a'] }).Rides).toBe('1 ride deselected');
  });

  it('formats large counts with thousands separators', () => {
    const ids = Array.from({ length: 1200 }, (_, k) => String(k));
    expect(describeFilter({ excludedActivityIds: ids }).Rides).toBe('1,200 rides deselected');
  });

  it('keeps a fixed order: years, months, rides', () => {
    const labels = describeActiveFilters(EMPTY_ACTIVITY_FILTER).map((item) => item.label);
    expect(labels).toEqual(['Years', 'Months', 'Rides']);
  });

  it('does not mutate the filter', () => {
    const filter = Object.freeze({
      selectedYears: Object.freeze([2022, 2024]),
      selectedMonths: Object.freeze([12, 1] as const),
      excludedActivityIds: Object.freeze(['a']),
    });
    expect(() => describeActiveFilters(filter)).not.toThrow();
    expect(filter.selectedYears).toEqual([2022, 2024]);
  });
});

import { describe, expect, it } from 'vitest';
import { EMPTY_ACTIVITY_FILTER } from '@/features/filters/store/filterStore';
import { activitiesInScope, filterActivities } from '@/features/filters/utils/filterActivities';
import { setRideIncluded } from '@/features/filters/utils/rideFilter';
import { setMonthSelected } from '@/features/filters/utils/monthFilter';
import { availableYears, setYearSelected } from '@/features/filters/utils/yearFilter';
import type { ActivityFilter, CyclingActivity, Month } from '@/types';

const ride = (activityId: string, year = 2024, month: Month = 1): CyclingActivity => ({
  activityId,
  activityName: `Ride ${activityId}`,
  activityDate: `${year}-${String(month).padStart(2, '0')}-01T08:00:00.000Z`,
  year,
  month,
  distanceKm: null,
  elevationGainM: null,
  movingTimeS: null,
  gpsTrack: [],
});

const filter = (patch: Partial<ActivityFilter>): ActivityFilter => ({
  ...EMPTY_ACTIVITY_FILTER,
  ...patch,
});
const ids = (activities: readonly CyclingActivity[]) => activities.map((a) => a.activityId);

describe('BR-07: year filter', () => {
  const rides = [ride('a', 2024), ride('b', 2023), ride('c', 2022), ride('d', 2023)];

  it('AC-06 / RULE-09: with no year selected, every year is included', () => {
    expect(filterActivities(rides, EMPTY_ACTIVITY_FILTER)).toBe(rides);
  });

  it('selecting a year narrows to that year', () => {
    expect(ids(filterActivities(rides, filter({ selectedYears: [2023] })))).toEqual(['b', 'd']);
  });

  it('allows several years at once', () => {
    const result = filterActivities(rides, filter({ selectedYears: [2024, 2022] }));
    expect(ids(result)).toEqual(['a', 'c']);
  });

  it('AC-07: deselecting a year removes its rides', () => {
    const before = filter({ selectedYears: [2024, 2023] });
    const after = filter({ selectedYears: setYearSelected(before.selectedYears, 2023, false) });

    expect(ids(filterActivities(rides, before))).toEqual(['a', 'b', 'd']);
    expect(ids(filterActivities(rides, after))).toEqual(['a']);
  });

  it('a selected year with no rides matches nothing', () => {
    expect(filterActivities(rides, filter({ selectedYears: [1999] }))).toEqual([]);
  });
});

describe('BR-09: individual ride filter', () => {
  const rides = [ride('a'), ride('b'), ride('c')];

  it('includes every ride while none is deselected', () => {
    expect(filterActivities(rides, EMPTY_ACTIVITY_FILTER)).toBe(rides);
  });

  it('AC-09: a deselected ride no longer contributes', () => {
    const result = filterActivities(rides, filter({ excludedActivityIds: ['b'] }));
    expect(ids(result)).toEqual(['a', 'c']);
  });

  it('can deselect every ride', () => {
    expect(filterActivities(rides, filter({ excludedActivityIds: ['a', 'b', 'c'] }))).toEqual([]);
  });

  it('ignores excluded IDs that are not in the dataset', () => {
    const result = filterActivities(rides, filter({ excludedActivityIds: ['missing'] }));
    expect(ids(result)).toEqual(['a', 'b', 'c']);
  });

  it('does not mutate the input', () => {
    const input = [...rides];
    filterActivities(input, filter({ excludedActivityIds: ['a'], selectedYears: [2024] }));
    expect(input).toEqual(rides);
  });
});

describe('ADR-0005: ride exclusion only narrows the year selection', () => {
  const rides = [ride('a', 2024), ride('b', 2023), ride('c', 2023)];

  it('a ride is included only if its year matches and it is not excluded', () => {
    const result = filterActivities(
      rides,
      filter({ selectedYears: [2023], excludedActivityIds: ['b'] }),
    );
    expect(ids(result)).toEqual(['c']);
  });

  it('the ride list offers only rides in the selected years, excluded ones included', () => {
    const scope = activitiesInScope(rides, { selectedYears: [2023], selectedMonths: [] });
    expect(ids(scope)).toEqual(['b', 'c']);
  });

  it('with no year selected, the ride list offers every ride', () => {
    expect(activitiesInScope(rides, EMPTY_ACTIVITY_FILTER)).toBe(rides);
  });
});

describe('BR-07: availableYears', () => {
  it('lists the distinct years in the data, newest first', () => {
    const years = availableYears([ride('a', 2022), ride('b', 2024), ride('c', 2022)]);
    expect(years).toEqual([2024, 2022]);
  });

  it('is empty for no rides', () => {
    expect(availableYears([])).toEqual([]);
  });
});

describe('BR-07: setYearSelected', () => {
  it('adds a year, keeping newest first', () => {
    expect(setYearSelected([2024, 2021], 2023, true)).toEqual([2024, 2023, 2021]);
  });

  it('removes a year; removing the last one means all years again', () => {
    expect(setYearSelected([2024, 2023], 2024, false)).toEqual([2023]);
    expect(setYearSelected([2023], 2023, false)).toEqual([]);
  });

  it('is a no-op when the year is already in the requested state', () => {
    const years = [2024];
    expect(setYearSelected(years, 2024, true)).toBe(years);
    expect(setYearSelected(years, 2023, false)).toBe(years);
  });

  it('never mutates the existing selection', () => {
    const years = Object.freeze([2024]);
    expect(() => setYearSelected(years, 2023, true)).not.toThrow();
    expect(years).toEqual([2024]);
  });
});

describe('BR-09: setRideIncluded', () => {
  it('deselecting adds the ride to the exclusion list', () => {
    expect(setRideIncluded(['a'], 'b', false)).toEqual(['a', 'b']);
  });

  it('reselecting removes it again, restoring its contribution', () => {
    expect(setRideIncluded(['a', 'b'], 'a', true)).toEqual(['b']);
  });

  it('is a no-op when the ride is already in the requested state', () => {
    const excluded = ['a'];
    expect(setRideIncluded(excluded, 'a', false)).toBe(excluded);
    expect(setRideIncluded(excluded, 'b', true)).toBe(excluded);
  });

  it('never mutates the existing list', () => {
    const excluded = Object.freeze(['a']);
    expect(() => setRideIncluded(excluded, 'b', false)).not.toThrow();
    expect(excluded).toEqual(['a']);
  });
});

describe('BR-08: month filter', () => {
  const rides = [
    ride('jan24', 2024, 1),
    ride('nov23', 2023, 11),
    ride('dec23', 2023, 12),
    ride('nov22', 2022, 11),
  ];

  it('RULE-09: with no month selected, every month is included', () => {
    expect(filterActivities(rides, filter({ selectedMonths: [] }))).toBe(rides);
  });

  it('selecting months narrows to them, across all years while no year is selected', () => {
    const result = filterActivities(rides, filter({ selectedMonths: [11] }));
    expect(ids(result)).toEqual(['nov23', 'nov22']);
  });

  it('covers both ends of the year: January and December', () => {
    const result = filterActivities(rides, filter({ selectedMonths: [1, 12] }));
    expect(ids(result)).toEqual(['jan24', 'dec23']);
  });

  it('AC-08: deselecting a month removes its rides, subject to the year filter', () => {
    const before = filter({ selectedYears: [2023], selectedMonths: [11, 12] });
    const after = { ...before, selectedMonths: setMonthSelected(before.selectedMonths, 12, false) };

    expect(ids(filterActivities(rides, before))).toEqual(['nov23', 'dec23']);
    expect(ids(filterActivities(rides, after))).toEqual(['nov23']);
  });

  it('AC-10: the same month across several selected years (Cartesian AND)', () => {
    const result = filterActivities(
      rides,
      filter({ selectedYears: [2023, 2022], selectedMonths: [11] }),
    );
    expect(ids(result)).toEqual(['nov23', 'nov22']);
  });

  it('a year and month that never occur together match nothing', () => {
    expect(
      filterActivities(rides, filter({ selectedYears: [2024], selectedMonths: [11] })),
    ).toEqual([]);
  });

  it('ride exclusions still apply within the selected months', () => {
    const result = filterActivities(
      rides,
      filter({ selectedMonths: [11], excludedActivityIds: ['nov22'] }),
    );
    expect(ids(result)).toEqual(['nov23']);
  });

  it('the ride list offers only rides in the selected months', () => {
    const scope = activitiesInScope(rides, { selectedYears: [], selectedMonths: [12] });
    expect(ids(scope)).toEqual(['dec23']);
  });
});

describe('BR-08: setMonthSelected', () => {
  it('adds a month, keeping calendar order', () => {
    expect(setMonthSelected([1, 12], 6, true)).toEqual([1, 6, 12]);
  });

  it('removes a month; removing the last one means all months again', () => {
    expect(setMonthSelected([3, 4], 3, false)).toEqual([4]);
    expect(setMonthSelected([4], 4, false)).toEqual([]);
  });

  it('is a no-op when the month is already in the requested state', () => {
    const months: Month[] = [5];
    expect(setMonthSelected(months, 5, true)).toBe(months);
    expect(setMonthSelected(months, 6, false)).toBe(months);
  });

  it('never mutates the existing selection', () => {
    const months = Object.freeze<Month[]>([5]);
    expect(() => setMonthSelected(months, 6, true)).not.toThrow();
    expect(months).toEqual([5]);
  });
});

describe('BR-11 / RULE-08: year, month and ride filters combine', () => {
  const rides = [
    ride('nov23', 2023, 11),
    ride('nov23b', 2023, 11),
    ride('dec23', 2023, 12),
    ride('nov22', 2022, 11),
    ride('nov24', 2024, 11),
  ];

  it('a ride contributes only if it passes all three filters', () => {
    const result = filterActivities(
      rides,
      filter({
        selectedYears: [2023, 2022],
        selectedMonths: [11],
        excludedActivityIds: ['nov23b'],
      }),
    );
    expect(ids(result)).toEqual(['nov23', 'nov22']);
  });

  it('changing any one filter changes the result', () => {
    const base = filter({ selectedYears: [2023], selectedMonths: [11] });
    expect(ids(filterActivities(rides, base))).toEqual(['nov23', 'nov23b']);
    expect(ids(filterActivities(rides, { ...base, selectedYears: [2024] }))).toEqual(['nov24']);
    expect(ids(filterActivities(rides, { ...base, selectedMonths: [12] }))).toEqual(['dec23']);
    expect(ids(filterActivities(rides, { ...base, excludedActivityIds: ['nov23'] }))).toEqual([
      'nov23b',
    ]);
  });
});

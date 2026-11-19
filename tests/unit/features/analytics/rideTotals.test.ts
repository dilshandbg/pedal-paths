import { describe, expect, it } from 'vitest';
import { isInRange, localDate, startedInRange } from '@/features/analytics/services/dateRange';
import {
  distanceByMonth,
  distanceByYear,
  totalRides,
} from '@/features/analytics/services/rideTotals';
import type { AnalyticsRide } from '@/types';

/** SYNTHETIC rides. */
const ride = (
  activityId: string,
  activityDate: string,
  patch: Partial<AnalyticsRide> = {},
): AnalyticsRide => ({
  activityId,
  activityName: `Ride ${activityId}`,
  activityDate,
  distanceKm: 10,
  elevationGainM: 100,
  movingTimeS: 1800,
  ...patch,
});

const rides = [
  ride('1', '2023-12-31T23:30:00.000Z', { distanceKm: 20.5 }),
  ride('2', '2024-01-15T08:00:00.000Z', { distanceKm: null, elevationGainM: null }),
  ride('3', '2024-01-20T08:00:00.000Z', { movingTimeS: null }),
  ride('4', '2024-03-01T08:00:00.000Z', { distanceKm: 0.1234 }),
];

describe('BR-38: date ranges', () => {
  it('takes the calendar date in the time zone', () => {
    expect(localDate('2023-12-31T23:30:00.000Z', 'UTC')).toBe('2023-12-31');
    expect(localDate('2023-12-31T23:30:00.000Z', 'Europe/Berlin')).toBe('2024-01-01');
    expect(localDate('nope', 'UTC')).toBeNull();
  });

  it('includes both ends and allows open ends', () => {
    expect(isInRange('2024-01-01', { from: '2024-01-01', to: '2024-01-01' })).toBe(true);
    expect(isInRange('2023-12-31', { from: '2024-01-01', to: null })).toBe(false);
    expect(isInRange('2030-01-01', { from: null, to: null })).toBe(true);
    expect(startedInRange('bad', { from: null, to: null })).toBe(false);
  });
});

describe('BR-38 / AC-42: distance by month and by year', () => {
  it('totals each month with rides, oldest first, counting only known values (RULE-13)', () => {
    expect(distanceByMonth(rides, undefined, 'UTC')).toEqual([
      {
        year: 2023,
        month: 12,
        rideCount: 1,
        distanceKm: 20.5,
        elevationGainM: 100,
        movingTimeS: 1800,
        ridesWithoutDistance: 0,
      },
      {
        year: 2024,
        month: 1,
        rideCount: 2,
        distanceKm: 10,
        elevationGainM: 100,
        movingTimeS: 1800,
        ridesWithoutDistance: 1,
      },
      {
        year: 2024,
        month: 3,
        rideCount: 1,
        distanceKm: 0.123,
        elevationGainM: 100,
        movingTimeS: 1800,
        ridesWithoutDistance: 0,
      },
    ]);
  });

  it('assigns a ride near midnight to the month and year of the time zone', () => {
    expect(distanceByYear(rides, undefined, 'UTC').map((y) => [y.year, y.rideCount])).toEqual([
      [2023, 1],
      [2024, 3],
    ]);
    expect(
      distanceByYear(rides, undefined, 'Europe/Berlin').map((y) => [y.year, y.rideCount]),
    ).toEqual([[2024, 4]]);
    expect(distanceByMonth(rides, undefined, 'Europe/Berlin')[0]).toMatchObject({
      year: 2024,
      month: 1,
      rideCount: 3,
    });
  });

  it('limits the totals to a date range', () => {
    const january = { from: '2024-01-01', to: '2024-01-31' };

    expect(distanceByMonth(rides, january, 'UTC').map((m) => m.month)).toEqual([1]);
    expect(totalRides(rides, january, 'UTC')).toEqual({
      rideCount: 2,
      distanceKm: 10,
      elevationGainM: 100,
      movingTimeS: 1800,
      ridesWithoutDistance: 1,
    });
  });

  it('gives empty results for no rides, and the same result however often it is asked', () => {
    expect(distanceByMonth([])).toEqual([]);
    expect(distanceByYear([])).toEqual([]);
    expect(totalRides([])).toEqual({
      rideCount: 0,
      distanceKm: 0,
      elevationGainM: 0,
      movingTimeS: 0,
      ridesWithoutDistance: 0,
    });
    expect(distanceByYear(rides, undefined, 'UTC')).toEqual(
      distanceByYear(rides, undefined, 'UTC'),
    );
  });
});

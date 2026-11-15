import { describe, expect, it } from 'vitest';
import { describeSummary, NOT_AVAILABLE } from '@/features/activities/utils/describeSummary';
import { summarizeActivities } from '@/features/activities/utils/summarizeActivities';
import type { ActivitySummary, CyclingActivity } from '@/types';

const ride = (
  activityId: string,
  distanceKm: number | null,
  elevationGainM: number | null,
  movingTimeS: number | null = null,
): CyclingActivity => ({
  activityId,
  activityName: activityId,
  activityDate: '2024-01-01T08:00:00.000Z',
  year: 2024,
  month: 1,
  distanceKm,
  elevationGainM,
  movingTimeS,
  gpsTrack: [],
});

const summary = (patch: Partial<ActivitySummary>): ActivitySummary => ({
  activityCount: 0,
  totalDistanceKm: 0,
  totalElevationGainM: 0,
  totalMovingTimeS: null,
  averageDistanceKm: null,
  ...patch,
});

describe('BR-14 / BR-19 / UX-08: summarizeActivities', () => {
  it('AC-13: counts the activities it is given (the filtered rides)', () => {
    expect(summarizeActivities([ride('a', 10, 100), ride('b', 20, 50)]).activityCount).toBe(2);
  });

  it('totals distance and elevation gain', () => {
    const result = summarizeActivities([ride('a', 10.25, 100), ride('b', 20.5, 50.4)]);
    expect(result.totalDistanceKm).toBeCloseTo(30.75, 10);
    expect(result.totalElevationGainM).toBeCloseTo(150.4, 10);
  });

  it('AC-19: totals moving time and averages distance per ride', () => {
    const result = summarizeActivities([ride('a', 10, 0, 1800), ride('b', 30, 0, 5400)]);
    expect(result.totalMovingTimeS).toBe(7200);
    expect(result.averageDistanceKm).toBe(20);
  });

  it('RULE-13: counts rides with unknown values but leaves them out of those values', () => {
    const result = summarizeActivities([
      ride('a', 10, null, 600),
      ride('b', null, 30, null),
      ride('c', 20, 10, null),
    ]);
    expect(result).toEqual({
      activityCount: 3,
      totalDistanceKm: 30,
      totalElevationGainM: 40,
      totalMovingTimeS: 600,
      averageDistanceKm: 15, // 30 km over the 2 rides with a distance, not 3
    });
  });

  it('has no moving time or average when no ride provides one', () => {
    const result = summarizeActivities([ride('a', null, null, null)]);
    expect(result.totalMovingTimeS).toBeNull();
    expect(result.averageDistanceKm).toBeNull();
  });

  it('is empty for no rides', () => {
    expect(summarizeActivities([])).toEqual(summary({}));
  });
});

describe('BR-19 / UX-08: describeSummary', () => {
  it('formats every statistic, metric units', () => {
    const items = describeSummary({
      activityCount: 1234,
      totalDistanceKm: 5678.25,
      totalElevationGainM: 12345.6,
      totalMovingTimeS: 4 * 3600 + 5 * 60 + 29,
      averageDistanceKm: 4.6,
    });
    expect(items).toEqual([
      { label: 'Rides', value: '1,234 rides' },
      { label: 'Distance', value: '5,678.3 km' },
      { label: 'Elevation gain', value: '12,346 m' },
      { label: 'Moving time', value: '4 h 05 min' },
      { label: 'Average distance', value: '4.6 km' },
    ]);
  });

  it('says when moving time or average distance is not available', () => {
    const values = describeSummary(summary({ activityCount: 1 })).map((item) => item.value);
    expect(values).toEqual(['1 ride', '0.0 km', '0 m', NOT_AVAILABLE, NOT_AVAILABLE]);
  });

  it('uses the plural for no rides', () => {
    expect(describeSummary(summary({}))[0]?.value).toBe('0 rides');
  });
});

import { describe, expect, it } from 'vitest';
import { describeSummary } from '@/features/activities/utils/describeSummary';
import { summarizeActivities } from '@/features/activities/utils/summarizeActivities';
import type { CyclingActivity } from '@/types';

const ride = (
  activityId: string,
  distanceKm: number | null,
  elevationGainM: number | null,
): CyclingActivity => ({
  activityId,
  activityName: activityId,
  activityDate: '2024-01-01T08:00:00.000Z',
  year: 2024,
  month: 1,
  distanceKm,
  elevationGainM,
  gpsTrack: [],
});

describe('BR-14 / UX-08: summarizeActivities', () => {
  it('AC-13: counts the activities it is given (the filtered rides)', () => {
    const summary = summarizeActivities([ride('a', 10, 100), ride('b', 20, 50)]);
    expect(summary.activityCount).toBe(2);
  });

  it('totals distance and elevation gain', () => {
    const summary = summarizeActivities([ride('a', 10.25, 100), ride('b', 20.5, 50.4)]);
    expect(summary.totalDistanceKm).toBeCloseTo(30.75, 10);
    expect(summary.totalElevationGainM).toBeCloseTo(150.4, 10);
  });

  it('counts rides with unknown metrics but leaves them out of the totals', () => {
    const summary = summarizeActivities([ride('a', 10, null), ride('b', null, 30)]);
    expect(summary).toEqual({ activityCount: 2, totalDistanceKm: 10, totalElevationGainM: 30 });
  });

  it('is all zero for no rides', () => {
    expect(summarizeActivities([])).toEqual({
      activityCount: 0,
      totalDistanceKm: 0,
      totalElevationGainM: 0,
    });
  });
});

describe('UX-08: describeSummary', () => {
  it('formats count, distance (km, 1 decimal) and elevation gain (m, whole)', () => {
    const items = describeSummary({
      activityCount: 1234,
      totalDistanceKm: 5678.25,
      totalElevationGainM: 12345.6,
    });
    expect(items).toEqual([
      { label: 'Rides', value: '1,234 rides' },
      { label: 'Distance', value: '5,678.3 km' },
      { label: 'Elevation gain', value: '12,346 m' },
    ]);
  });

  it('uses the singular for one ride and shows zeros for none', () => {
    expect(
      describeSummary({ activityCount: 1, totalDistanceKm: 0, totalElevationGainM: 0 }).map(
        (item) => item.value,
      ),
    ).toEqual(['1 ride', '0.0 km', '0 m']);
    expect(
      describeSummary({ activityCount: 0, totalDistanceKm: 0, totalElevationGainM: 0 })[0]?.value,
    ).toBe('0 rides');
  });
});

import { describe, expect, it } from 'vitest';
import { describeRide } from '@/features/filters/utils/describeRide';
import type { CyclingActivity } from '@/types';

const ride = (patch: Partial<CyclingActivity> = {}): CyclingActivity => ({
  activityId: '42',
  activityName: 'Morning Ride',
  activityDate: '2023-11-05T08:00:00.000Z',
  year: 2023,
  month: 11,
  distanceKm: 42.195,
  elevationGainM: 512.4,
  movingTimeS: null,
  gpsTrack: [],
  ...patch,
});

describe('BR-13: activity details', () => {
  it('shows name, date, distance and elevation gain', () => {
    expect(describeRide(ride(), 'UTC')).toEqual({
      activityId: '42',
      name: 'Morning Ride',
      details: 'Nov 5, 2023 · 42.2 km · 512 m gain',
    });
  });

  it('"when available": leaves out an unknown distance', () => {
    expect(describeRide(ride({ distanceKm: null }), 'UTC').details).toBe(
      'Nov 5, 2023 · 512 m gain',
    );
  });

  it('"when available": leaves out an unknown elevation gain', () => {
    expect(describeRide(ride({ elevationGainM: null }), 'UTC').details).toBe(
      'Nov 5, 2023 · 42.2 km',
    );
  });

  it('shows only the date when neither metric is known', () => {
    const details = describeRide(ride({ distanceKm: null, elevationGainM: null }), 'UTC').details;
    expect(details).toBe('Nov 5, 2023');
  });

  it('shows a known zero (a flat ride) rather than hiding it', () => {
    expect(describeRide(ride({ elevationGainM: 0 }), 'UTC').details).toBe(
      'Nov 5, 2023 · 42.2 km · 0 m gain',
    );
  });

  it('uses the local calendar date of the given time zone (ADR-0007)', () => {
    const late = ride({ activityDate: '2023-12-31T23:30:00.000Z' });
    expect(describeRide(late, 'Asia/Tokyo').details.startsWith('Jan 1, 2024')).toBe(true);
  });

  it('keeps the fallback name of an untitled ride', () => {
    expect(describeRide(ride({ activityName: 'Untitled ride' }), 'UTC').name).toBe('Untitled ride');
  });
});

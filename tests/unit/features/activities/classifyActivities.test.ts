import { describe, expect, it } from 'vitest';
import {
  RIDE_ACTIVITY_TYPES,
  classifyActivities,
  isRideActivityType,
} from '@/features/activities/services/classifyActivities';
import type { ActivityCsvRow } from '@/services/strava-export/activitiesCsv';

const row = (activityId: string, activityType: string): ActivityCsvRow => ({
  activityId,
  activityType,
  activityDate: '',
  activityName: '',
  distanceMetres: null,
  elevationGainMetres: null,
  fileName: '',
});

describe('AC-03: Ride identification', () => {
  it('only the BRD-defined type "Ride" counts as a ride', () => {
    expect(RIDE_ACTIVITY_TYPES).toEqual(['Ride']);
  });

  it.each(['Ride', 'ride', ' Ride '])('accepts %j', (type) => {
    expect(isRideActivityType(type)).toBe(true);
  });
});

describe('AC-04: non-Ride exclusion', () => {
  it.each([
    'Run',
    'Swim',
    'Workout',
    'Walk',
    'Hike',
    'Virtual Ride',
    'E-Bike Ride',
    'Gravel Ride',
    'Mountain Bike Ride',
    '',
  ])('rejects %j', (type) => {
    expect(isRideActivityType(type)).toBe(false);
  });

  it('keeps rides in order and counts what was excluded', () => {
    const result = classifyActivities([
      row('1', 'Ride'),
      row('2', 'Run'),
      row('3', 'Ride'),
      row('4', 'Swim'),
      row('5', 'Workout'),
    ]);

    expect(result.rides.map((ride) => ride.activityId)).toEqual(['1', '3']);
    expect(result.excludedCount).toBe(3);
  });

  it('handles an export with no activities', () => {
    expect(classifyActivities([])).toEqual({ rides: [], excludedCount: 0 });
  });
});

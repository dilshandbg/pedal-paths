import { describe, expect, it } from 'vitest';
import { EMPTY_ACTIVITY_FILTER } from '@/features/filters/store/filterStore';
import { filterExcludedRides, setRideIncluded } from '@/features/filters/utils/rideFilter';
import type { CyclingActivity } from '@/types';

const ride = (activityId: string): CyclingActivity => ({
  activityId,
  activityName: `Ride ${activityId}`,
  activityDate: '2024-01-01T08:00:00.000Z',
  year: 2024,
  month: 1,
  distanceKm: null,
  elevationGainM: null,
  gpsTrack: [],
});

const rides = [ride('a'), ride('b'), ride('c')];
const withExcluded = (...ids: string[]) => ({ ...EMPTY_ACTIVITY_FILTER, excludedActivityIds: ids });

describe('BR-09: individual ride filter', () => {
  it('includes every ride while none is deselected', () => {
    expect(filterExcludedRides(rides, EMPTY_ACTIVITY_FILTER)).toBe(rides);
  });

  it('AC-09: a deselected ride no longer contributes', () => {
    const result = filterExcludedRides(rides, withExcluded('b'));
    expect(result.map((r) => r.activityId)).toEqual(['a', 'c']);
  });

  it('can deselect every ride', () => {
    expect(filterExcludedRides(rides, withExcluded('a', 'b', 'c'))).toEqual([]);
  });

  it('ignores excluded IDs that are not in the dataset', () => {
    const result = filterExcludedRides(rides, withExcluded('missing'));
    expect(result.map((r) => r.activityId)).toEqual(['a', 'b', 'c']);
  });

  it('does not mutate the input', () => {
    const input = [...rides];
    filterExcludedRides(input, withExcluded('a'));
    expect(input).toEqual(rides);
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

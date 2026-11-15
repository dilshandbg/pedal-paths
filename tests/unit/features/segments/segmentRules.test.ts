import { describe, expect, it } from 'vitest';
import {
  changedFields,
  effortKey,
  isCalendarDate,
  isIsoDateTime,
  mergeSegment,
  personalBest,
} from '@/features/segments/services/segmentRules';
import { effortRecord, segmentRecord } from './fixtures';

describe('RULE-16: mergeSegment', () => {
  it('stores a new segment as given', () => {
    const incoming = segmentRecord();
    expect(mergeSegment(null, incoming)).toBe(incoming);
  });

  it('replaces values present in the new file and keeps absent ones', () => {
    const stored = segmentRecord({ distanceM: 1500, city: 'Testville', route: null });
    const incoming = segmentRecord({
      name: 'Test Hill (renamed)',
      distanceM: 1520,
      city: null,
      route: [
        { latitude: 1, longitude: 2 },
        { latitude: 1.1, longitude: 2.1 },
      ],
    });

    const merged = mergeSegment(stored, incoming);

    expect(merged.name).toBe('Test Hill (renamed)');
    expect(merged.distanceM).toBe(1520);
    expect(merged.city).toBe('Testville'); // absent in the new file: kept
    expect(merged.route).toHaveLength(2);
    expect(merged.segmentId).toBe(stored.segmentId);
  });

  it('RULE-19: keeps stored samples while the route stays the same', () => {
    const stored = segmentRecord({ altitudeSamplesM: [1, 2, 3], distanceSamplesM: [0, 1, 2] });
    expect(mergeSegment(stored, segmentRecord({ name: 'Renamed' }))).toMatchObject({
      name: 'Renamed',
      altitudeSamplesM: [1, 2, 3],
      distanceSamplesM: [0, 1, 2],
    });
    expect(mergeSegment(stored, segmentRecord({ route: null }))).toMatchObject({
      altitudeSamplesM: [1, 2, 3],
    });
  });

  it('RULE-19: drops stored samples when a different route arrives without samples', () => {
    const stored = segmentRecord({ altitudeSamplesM: [1, 2, 3], distanceSamplesM: [0, 1, 2] });
    const newRoute = [
      { latitude: 5, longitude: 5 },
      { latitude: 5.1, longitude: 5.1 },
    ];
    expect(mergeSegment(stored, segmentRecord({ route: newRoute }))).toMatchObject({
      route: newRoute,
      altitudeSamplesM: null,
      distanceSamplesM: null,
    });
    expect(
      mergeSegment(stored, segmentRecord({ route: newRoute, altitudeSamplesM: [7, 8] })),
    ).toMatchObject({ altitudeSamplesM: [7, 8], distanceSamplesM: null });
  });

  it('does not mutate its inputs', () => {
    const stored = Object.freeze(segmentRecord());
    const incoming = Object.freeze(segmentRecord({ distanceM: 9 }));
    expect(() => mergeSegment(stored, incoming)).not.toThrow();
    expect(stored.distanceM).toBe(1500);
  });
});

describe('changedFields', () => {
  it('lists the fields that differ, including nested geometry', () => {
    const stored = segmentRecord();
    expect(changedFields(stored, stored)).toEqual([]);
    expect(
      changedFields(stored, { ...stored, distanceM: 1, start: { latitude: 0, longitude: 0 } }),
    ).toEqual(['distanceM', 'start']);
  });
});

describe('RULE-16: effortKey', () => {
  it('uses the effort ID when there is one', () => {
    expect(effortKey(effortRecord({ effortId: '42' }))).toBe('42');
  });

  it('otherwise uses start time and elapsed time, independent of the date format', () => {
    const a = effortKey(effortRecord({ effortId: null, startDate: '2024-05-01T07:00:00Z' }));
    const b = effortKey(effortRecord({ effortId: null, startDate: '2024-05-01T09:00:00+02:00' }));
    expect(a).toBe('2024-05-01T07:00:00.000Z|300');
    expect(b).toBe(a);
  });
});

describe('RULE-17: personalBest', () => {
  it('is the fastest effort, dated by its start', () => {
    const best = personalBest(segmentRecord({ prElapsedTimeS: 999 }), [
      effortRecord({ elapsedTimeS: 320, startDate: '2024-04-01T07:00:00.000Z' }),
      effortRecord({ elapsedTimeS: 290, startDate: '2023-09-12T18:30:00.000Z' }),
    ]);
    expect(best).toEqual({ elapsedTimeS: 290, date: '2023-09-12', source: 'efforts' });
  });

  it('takes the earliest of equally fast efforts', () => {
    const best = personalBest(segmentRecord(), [
      effortRecord({ elapsedTimeS: 290, startDate: '2024-01-01T00:00:00.000Z' }),
      effortRecord({ elapsedTimeS: 290, startDate: '2022-01-01T00:00:00.000Z' }),
    ]);
    expect(best?.date).toBe('2022-01-01');
  });

  it('falls back to the personal best stated in the file', () => {
    expect(personalBest(segmentRecord({ prElapsedTimeS: 553, prDate: '1993-04-03' }), [])).toEqual({
      elapsedTimeS: 553,
      date: '1993-04-03',
      source: 'stated',
    });
  });

  it('is null when neither efforts nor a stated personal best exist', () => {
    expect(personalBest(segmentRecord({ prElapsedTimeS: null }), [])).toBeNull();
  });
});

describe('date checks', () => {
  it('accepts real calendar dates only', () => {
    expect(isCalendarDate('2024-02-29')).toBe(true);
    expect(isCalendarDate('2023-02-29')).toBe(false);
    expect(isCalendarDate('2024-13-01')).toBe(false);
    expect(isCalendarDate('01/02/2024')).toBe(false);
  });

  it('requires a time zone on date-times', () => {
    expect(isIsoDateTime('2024-06-01T07:12:00Z')).toBe(true);
    expect(isIsoDateTime('2024-06-01T07:12:00.5+02:00')).toBe(true);
    expect(isIsoDateTime('2024-06-01T07:12:00')).toBe(false);
    expect(isIsoDateTime('2024-06-01')).toBe(false);
    expect(isIsoDateTime('2024-06-41T07:12:00Z')).toBe(false);
  });
});

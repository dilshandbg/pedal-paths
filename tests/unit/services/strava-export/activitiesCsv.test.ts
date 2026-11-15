// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  ActivitiesCsvFormatError,
  parseActivitiesCsv,
  parseStravaDate,
} from '@/services/strava-export/activitiesCsv';
import { makeActivitiesCsv } from '../../../fixtures/stravaExport';

describe('parseActivitiesCsv', () => {
  it('maps Strava columns, using the metre-based second Distance column', () => {
    const csv = makeActivitiesCsv([
      {
        id: '42',
        date: 'Nov 14, 2023, 7:12:45 AM',
        name: 'Commute, home',
        type: 'Ride',
        fileName: 'activities/42.fit.gz',
        distanceMetres: 25310.5,
        elevationGain: 312.4,
        movingTimeSeconds: 3725,
        description: 'Two\nlines',
      },
    ]);

    expect(parseActivitiesCsv(csv)).toEqual([
      {
        activityId: '42',
        activityDate: 'Nov 14, 2023, 7:12:45 AM',
        activityName: 'Commute, home',
        activityType: 'Ride',
        distanceMetres: 25310.5,
        elevationGainMetres: 312.4,
        movingTimeSeconds: 3725,
        fileName: 'activities/42.fit.gz',
      },
    ]);
  });

  it('BR-19: has no moving time when the column is missing or empty', () => {
    const csv = 'Activity ID,Activity Type,Distance,Filename\n7,Ride,12.5,activities/7.gpx\n';
    expect(parseActivitiesCsv(csv)[0]?.movingTimeSeconds).toBeNull();
    const empty = makeActivitiesCsv([{ id: '8', date: '', name: 'x', type: 'Ride', fileName: '' }]);
    expect(parseActivitiesCsv(empty)[0]?.movingTimeSeconds).toBeNull();
  });

  it('treats a single Distance column as kilometres', () => {
    const csv = 'Activity ID,Activity Type,Distance,Filename\n7,Ride,12.5,activities/7.gpx\n';
    expect(parseActivitiesCsv(csv)[0]?.distanceMetres).toBe(12500);
  });

  it('returns null for missing or non-numeric metrics', () => {
    const csv = makeActivitiesCsv([
      { id: '1', date: '', name: '', type: 'Ride', fileName: '', distanceMetres: null },
    ]);
    const [row] = parseActivitiesCsv(csv);
    expect(row?.distanceMetres).toBeNull();
    expect(row?.elevationGainMetres).toBeNull();
  });

  it('skips blank lines', () => {
    const csv = 'Activity ID,Activity Type,Filename\n1,Ride,a.gpx\n,,\n\n2,Run,b.gpx\n';
    expect(parseActivitiesCsv(csv).map((row) => row.activityId)).toEqual(['1', '2']);
  });

  it.each(['Activity ID', 'Activity Type', 'Filename'])(
    'rejects a CSV without the "%s" column',
    (missing) => {
      const header = ['Activity ID', 'Activity Type', 'Filename'].filter((h) => h !== missing);
      expect(() => parseActivitiesCsv(`${header.join(',')}\n`)).toThrow(ActivitiesCsvFormatError);
    },
  );

  it('rejects an empty file', () => {
    expect(() => parseActivitiesCsv('')).toThrow(ActivitiesCsvFormatError);
  });
});

describe('parseStravaDate', () => {
  it.each([
    ['Nov 14, 2023, 7:12:45 AM', '2023-11-14T07:12:45.000Z'],
    ['Nov 14, 2023, 7:12:45 PM', '2023-11-14T19:12:45.000Z'],
    ['Jan 1, 2024, 12:00:00 AM', '2024-01-01T00:00:00.000Z'],
    ['Jan 1, 2024, 12:30:00 PM', '2024-01-01T12:30:00.000Z'],
    ['Dec 31, 2023, 11:59:59 PM', '2023-12-31T23:59:59.000Z'],
    ['Sep 3, 2021, 18:05:00', '2021-09-03T18:05:00.000Z'],
    ['2023-11-14T07:12:45Z', '2023-11-14T07:12:45.000Z'],
    ['2023-11-14T07:12:45+05:30', '2023-11-14T01:42:45.000Z'],
  ])('parses %s as UTC', (input, expected) => {
    expect(parseStravaDate(input)).toBe(expected);
  });

  it.each([
    '',
    'yesterday',
    'Foo 1, 2023, 1:00:00 AM',
    'Feb 30, 2023, 1:00:00 AM',
    '2023-11-14T07:12:45',
  ])('returns null for %j', (input) => {
    expect(parseStravaDate(input)).toBeNull();
  });
});

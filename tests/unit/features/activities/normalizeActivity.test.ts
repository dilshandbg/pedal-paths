import { describe, expect, it } from 'vitest';
import {
  UNTITLED_RIDE_NAME,
  normalizeActivity,
} from '@/features/activities/services/normalizeActivity';
import type { ParsedTrack } from '@/services/gpx/parseGpx';
import type { ActivityCsvRow } from '@/services/strava-export/activitiesCsv';
import type { GPSPoint } from '@/types';

const points: GPSPoint[] = [
  { latitude: 0, longitude: 0, elevation: 100, timestamp: '2024-03-10T07:00:00.000Z' },
  { latitude: 0.01, longitude: 0, elevation: 120, timestamp: '2024-03-10T07:02:00.000Z' },
];

const track = (overrides: Partial<ParsedTrack> = {}): ParsedTrack => ({
  name: 'Track name',
  startTime: '2024-03-10T07:00:00.000Z',
  points,
  ...overrides,
});

const row = (overrides: Partial<ActivityCsvRow> = {}): ActivityCsvRow => ({
  activityId: '42',
  activityDate: 'Nov 14, 2023, 7:12:45 AM',
  activityName: 'Morning Ride',
  activityType: 'Ride',
  distanceMetres: 25_310,
  elevationGainMetres: 312.44,
  fileName: 'activities/42.gpx',
  ...overrides,
});

const utc = { timeZone: 'UTC' } as const;

describe('normalizeActivity', () => {
  it('DATA-03: builds an activity from the CSV row and the track', () => {
    const result = normalizeActivity(row(), track(), utc);

    expect(result).toEqual({
      ok: true,
      activity: {
        activityId: '42',
        activityName: 'Morning Ride',
        activityDate: '2023-11-14T07:12:45.000Z',
        year: 2023,
        month: 11,
        distanceKm: 25.31,
        elevationGainM: 312.4,
        gpsTrack: points,
      },
    });
  });

  it('falls back to the track for date, distance, elevation and name', () => {
    const result = normalizeActivity(
      row({ activityDate: '', distanceMetres: null, elevationGainMetres: null, activityName: '' }),
      track(),
      utc,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.activity.activityName).toBe('Track name');
      expect(result.activity.activityDate).toBe('2024-03-10T07:00:00.000Z');
      expect(result.activity.month).toBe(3);
      expect(result.activity.distanceKm).toBeCloseTo(1.112, 3);
      expect(result.activity.elevationGainM).toBe(20);
    }
  });

  it('uses "Untitled ride" when neither the CSV nor the track has a name', () => {
    const result = normalizeActivity(row({ activityName: '' }), track({ name: null }), utc);
    expect(result.ok && result.activity.activityName).toBe(UNTITLED_RIDE_NAME);
  });

  it('BR-13: leaves elevation gain null when no source has it', () => {
    const flat = points.map((p) => ({ ...p, elevation: null }));
    const result = normalizeActivity(
      row({ elevationGainMetres: null }),
      track({ points: flat }),
      utc,
    );
    expect(result.ok && result.activity.elevationGainM).toBeNull();
  });

  it('RULE-07: reports tracks with fewer than 2 valid points', () => {
    const result = normalizeActivity(row(), track({ points: points.slice(0, 1) }), utc);
    expect(result).toEqual({
      ok: false,
      issue: {
        activityId: '42',
        activityName: 'Morning Ride',
        fileName: 'activities/42.gpx',
        reason: 'no-usable-gps',
      },
    });
  });

  it('RULE-07: reports rides whose date cannot be determined', () => {
    const result = normalizeActivity(row({ activityDate: '' }), track({ startTime: null }), utc);
    expect(!result.ok && result.issue.reason).toBe('missing-date');
  });

  it('derives year/month in the configured time zone (ADR-0007)', () => {
    const result = normalizeActivity(row({ activityDate: 'Dec 31, 2023, 8:00:00 PM' }), track(), {
      timeZone: 'Asia/Colombo',
    });
    expect(result.ok && [result.activity.year, result.activity.month]).toEqual([2024, 1]);
  });
});

// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  decodeRideHistory,
  encodeUploadBundle,
} from '@/features/activities/services/rideHistoryBundle';
import { decodeRideBundle, encodeRideBundle } from '@/services/ride-history/rideBundle';
import { encodeTrack } from '@/services/ride-history/trackCodec';
import type { CyclingActivity, NewUpload, StoredRideDetails } from '@/types';

const track = [
  { latitude: 51.5, longitude: -0.12, elevation: 10, timestamp: '2024-03-10T07:00:00.000Z' },
  { latitude: 51.501, longitude: -0.12, elevation: 11, timestamp: '2024-03-10T07:00:05.000Z' },
];

const activity = (activityId: string, patch: Partial<CyclingActivity> = {}): CyclingActivity => ({
  activityId,
  activityName: `Ride ${activityId}`,
  activityDate: '2024-03-10T07:00:00.000Z',
  year: 2024,
  month: 3,
  distanceKm: 12.5,
  elevationGainM: null,
  movingTimeS: 1800,
  gpsTrack: track,
  ...patch,
});

const upload: NewUpload = {
  fileName: 'export.zip',
  fileSizeBytes: 123,
  fileHash: 'a'.repeat(64),
  skippedCount: 1,
  excludedNonRideCount: 2,
};

const stored = (details: Partial<StoredRideDetails> & Record<string, unknown>, points = track) => ({
  details: {
    activityId: '1',
    activityName: 'Ride',
    activityDate: '2024-03-10T07:00:00.000Z',
    distanceKm: 1,
    elevationGainM: null,
    movingTimeS: null,
    ...details,
  } as StoredRideDetails,
  track: encodeTrack(points),
});

describe('BR-33: ride history bundles', () => {
  it('encodes an upload with its details and every ride', () => {
    const bundle = decodeRideBundle(encodeUploadBundle(upload, [activity('1'), activity('2')]));

    expect(bundle.meta).toEqual({ upload });
    expect(bundle.rides.map((r) => r.details)).toEqual([
      {
        activityId: '1',
        activityName: 'Ride 1',
        activityDate: '2024-03-10T07:00:00.000Z',
        distanceKm: 12.5,
        elevationGainM: null,
        movingTimeS: 1800,
      },
      expect.objectContaining({ activityId: '2' }),
    ]);
  });

  it('decodes stored rides back into activities, newest first', () => {
    const bytes = encodeUploadBundle(upload, [
      activity('1', { activityDate: '2023-01-01T08:00:00.000Z', year: 2023, month: 1 }),
      activity('2'),
    ]);

    const { activities, skippedCount } = decodeRideHistory(bytes, { timeZone: 'UTC' });

    expect(skippedCount).toBe(0);
    expect(activities.map((a) => a.activityId)).toEqual(['2', '1']);
    expect(activities[0]).toEqual(activity('2'));
  });

  it('derives year and month in the given time zone (ADR-0007), across a year boundary', () => {
    const bytes = encodeRideBundle({}, [stored({ activityDate: '2023-12-31T23:30:00.000Z' })]);

    expect(decodeRideHistory(bytes, { timeZone: 'UTC' }).activities[0]).toMatchObject({
      year: 2023,
      month: 12,
    });
    expect(decodeRideHistory(bytes, { timeZone: 'Europe/Berlin' }).activities[0]).toMatchObject({
      year: 2024,
      month: 1,
    });
  });

  it('skips entries that cannot be shown, without failing the rest', () => {
    const bytes = encodeRideBundle({}, [
      stored({ activityId: '1' }),
      stored({ activityId: '' }),
      stored({ activityId: '3', activityDate: 'not a date' }),
      stored({ activityId: '4', distanceKm: -1 }),
      stored({ activityId: '5' }, [track[0]!]), // ! safe: the fixture track has two points
      { details: stored({ activityId: '6' }).details, track: new Uint8Array([9, 9]) },
      stored({ activityId: '1' }), // the same activity twice
    ]);

    const { activities, skippedCount } = decodeRideHistory(bytes);

    expect(activities.map((a) => a.activityId)).toEqual(['1']);
    expect(skippedCount).toBe(6);
  });

  it('throws when the response is not a ride bundle at all', () => {
    expect(() => decodeRideHistory(new Uint8Array([1, 2, 3]))).toThrow();
  });
});

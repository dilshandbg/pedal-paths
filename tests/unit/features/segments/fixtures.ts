import type { SegmentEffortRecord, SegmentRecord } from '@/types';

/** SYNTHETIC segment data for tests. Not real Strava data. */
export const segmentRecord = (patch: Partial<SegmentRecord> = {}): SegmentRecord => ({
  segmentId: '1001',
  name: 'Test Hill',
  distanceM: 1500,
  elevationGainM: 80,
  averageGradePct: 5.3,
  maximumGradePct: 11,
  elevationHighM: 180,
  elevationLowM: 100,
  city: 'Testville',
  state: null,
  country: 'Nowhere',
  start: { latitude: 10, longitude: 20 },
  end: { latitude: 10.01, longitude: 20.01 },
  route: [
    { latitude: 10, longitude: 20 },
    { latitude: 10.005, longitude: 20.004 },
    { latitude: 10.01, longitude: 20.01 },
  ],
  altitudeSamplesM: null,
  distanceSamplesM: null,
  prElapsedTimeS: 300,
  prDate: '2024-05-01',
  effortCount: 2,
  ...patch,
});

export const effortRecord = (patch: Partial<SegmentEffortRecord> = {}): SegmentEffortRecord => ({
  segmentId: '1001',
  effortId: '5001',
  activityId: '9001',
  startDate: '2024-05-01T07:00:00.000Z',
  elapsedTimeS: 300,
  movingTimeS: 295,
  ...patch,
});

import type { SegmentDetail, StoredSegment } from '@/types';
import { segmentRecord } from './fixtures';

/** SYNTHETIC stored segment, as the backend lists it. Not real Strava data. */
export const storedSegment = (patch: Partial<StoredSegment> = {}): StoredSegment => ({
  ...segmentRecord(),
  sourceFile: 'segments.json',
  importedAt: '2025-01-01T10:00:00.000Z',
  updatedAt: '2025-01-01T10:00:00.000Z',
  storedEffortCount: 2,
  personalBest: { elapsedTimeS: 290, date: '2024-05-01', source: 'efforts' },
  ...patch,
});

export const segmentDetail = (patch: Partial<SegmentDetail> = {}): SegmentDetail => ({
  ...storedSegment(),
  efforts: [
    {
      segmentId: '1001',
      effortId: '5002',
      activityId: null,
      startDate: '2024-05-01T07:00:00.000Z',
      elapsedTimeS: 290,
      movingTimeS: 285,
      isPersonalBest: true,
    },
    {
      segmentId: '1001',
      effortId: '5001',
      activityId: '9001',
      startDate: '2024-04-01T07:00:00.000Z',
      elapsedTimeS: 300,
      movingTimeS: null,
      isPersonalBest: false,
    },
  ],
  ...patch,
});

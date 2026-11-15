import { describe, expect, it } from 'vitest';
import {
  describeImportReview,
  describePersonalBest,
  describeSegmentDetail,
  describeSegmentListItem,
} from '@/features/segments/utils/describeSegment';
import {
  checkSegmentFile,
  describeImportPlan,
  describeImportResult,
  describeSegmentApiError,
} from '@/features/segments/utils/segmentMessages';
import type { SegmentImportPlan } from '@/types';
import { segmentDetail, storedSegment } from './storedFixtures';

const plan = (patch: Partial<SegmentImportPlan> = {}): SegmentImportPlan => ({
  items: [
    {
      segmentId: '1',
      name: 'New hill',
      distanceM: 2700,
      elevationGainM: 155,
      status: 'new',
      changedFields: [],
      newEffortCount: 2,
    },
    {
      segmentId: '2',
      name: 'Old hill',
      distanceM: null,
      elevationGainM: null,
      status: 'update',
      changedFields: ['distanceM', 'route', 'prElapsedTimeS'],
      newEffortCount: 1,
    },
  ],
  counts: { new: 1, update: 1, unchanged: 0 },
  newEffortCount: 3,
  ...patch,
});

describe('BR-25: describeSegmentListItem', () => {
  it('shows distance, elevation gain and personal best, leaving out unknown values', () => {
    expect(describeSegmentListItem(storedSegment())).toEqual({
      segmentId: '1001',
      name: 'Test Hill',
      details: '1.5 km · 80 m gain · PB 4:50',
    });
    expect(
      describeSegmentListItem(
        storedSegment({ distanceM: null, elevationGainM: null, personalBest: null }),
      ).details,
    ).toBe('');
  });
});

describe('AC-26 / RULE-17: describeSegmentDetail', () => {
  it('lists metadata and efforts with the personal best identified', () => {
    const view = describeSegmentDetail(segmentDetail(), 'UTC');
    expect(view.facts).toEqual(
      expect.arrayContaining([
        { label: 'Strava segment ID', value: '1001' },
        { label: 'Distance', value: '1.5 km' },
        { label: 'Average grade', value: '5.3 %' },
        { label: 'Elevation range', value: '100 m – 180 m' },
        { label: 'Location', value: 'Testville, Nowhere' },
        { label: 'Personal best', value: '4:50 on May 1, 2024' },
        { label: 'Efforts', value: '2' },
      ]),
    );
    expect(view.efforts).toEqual([
      {
        key: '5002',
        date: 'May 1, 2024',
        elapsedTime: '4:50',
        movingTime: '4:45',
        isPersonalBest: true,
      },
      {
        key: '5001',
        date: 'Apr 1, 2024',
        elapsedTime: '5:00',
        movingTime: '–',
        isPersonalBest: false,
      },
    ]);
    expect(view.personalBestNote).toBeNull();
  });

  it('explains a personal best stated by the file and shows unknown values', () => {
    const view = describeSegmentDetail(
      segmentDetail({
        efforts: [],
        storedEffortCount: 0,
        effortCount: 4,
        distanceM: null,
        city: null,
        country: null,
        personalBest: { elapsedTimeS: 553, date: null, source: 'stated' },
      }),
      'UTC',
    );
    expect(view.facts).toEqual(
      expect.arrayContaining([
        { label: 'Distance', value: 'Not available' },
        { label: 'Location', value: 'Not available' },
        { label: 'Personal best', value: '9:13' },
        { label: 'Efforts', value: '0 stored (4 according to the file)' },
      ]),
    );
    expect(view.personalBestNote).toMatch(/stated in the imported file/);
  });

  it('formats a personal best date as a calendar date in any time zone', () => {
    expect(describePersonalBest({ elapsedTimeS: 60, date: '2024-01-01', source: 'stated' })).toBe(
      '1:00 on Jan 1, 2024',
    );
    expect(describePersonalBest(null)).toBeNull();
  });
});

describe('AC-22: import review text', () => {
  it('describes each row with its status and changes', () => {
    expect(describeImportReview(plan())).toEqual([
      {
        segmentId: '1',
        name: 'New hill',
        figures: '2.7 km · 155 m gain',
        status: 'new',
        statusLabel: 'New',
        changes: '2 new efforts',
      },
      {
        segmentId: '2',
        name: 'Old hill',
        figures: '',
        status: 'update',
        statusLabel: 'Update',
        changes: 'distance, route, personal best · 1 new effort',
      },
    ]);
  });

  it('summarizes the plan and the stored result', () => {
    expect(describeImportPlan(plan())).toBe('1 new, 1 update, 0 unchanged · 3 new efforts');
    expect(describeImportResult(plan())).toBe(
      'Added 1 segment, updated 1 segment, stored 3 new efforts.',
    );
    expect(
      describeImportResult(
        plan({ items: [], counts: { new: 0, update: 0, unchanged: 2 }, newEffortCount: 0 }),
      ),
    ).toBe('Nothing changed: every segment was already up to date.');
  });
});

describe('BR-21: checkSegmentFile', () => {
  it('accepts JSON, GeoJSON and CSV up to 20 MB', () => {
    expect(checkSegmentFile({ name: 'a.json', size: 10 })).toBeNull();
    expect(checkSegmentFile({ name: 'A.GEOJSON', size: 10 })).toBeNull();
    expect(checkSegmentFile({ name: 'a.csv', size: 20 * 1024 * 1024 })).toBeNull();
  });

  it('rejects other types and larger files', () => {
    expect(checkSegmentFile({ name: 'a.zip', size: 10 })).toMatch(/Unsupported file type/);
    expect(checkSegmentFile({ name: 'a.json.txt', size: 10 })).toMatch(/Unsupported/);
    expect(checkSegmentFile({ name: 'a.csv', size: 20 * 1024 * 1024 + 1 })).toBe(
      'The file is larger than 20 MB.',
    );
  });
});

describe('NFR-08: describeSegmentApiError', () => {
  it('explains each code without technical details', () => {
    expect(describeSegmentApiError('storage-unavailable')).toMatch(/npm run dev/);
    expect(describeSegmentApiError('not-found')).toMatch(/no longer stored/);
    expect(describeSegmentApiError('storage-error')).toBe(
      'Segment storage failed. Please try again.',
    );
  });
});

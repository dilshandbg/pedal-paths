import { describe, expect, it } from 'vitest';
import {
  IMPORT_FAILURE_MESSAGES,
  describeUploadFailure,
  IMPORT_ISSUE_LABELS,
  groupIssuesByReason,
  pluralize,
} from '@/features/activities/utils/importMessages';
import type { ImportIssue, ImportIssueReason } from '@/types';

const issue = (reason: ImportIssueReason): ImportIssue => ({
  activityId: null,
  activityName: null,
  fileName: null,
  reason,
});

describe('import messages', () => {
  it('AC-16: has a non-empty message for every failure reason', () => {
    for (const message of Object.values(IMPORT_FAILURE_MESSAGES)) {
      expect(message.length).toBeGreaterThan(20);
    }
    expect(Object.keys(IMPORT_FAILURE_MESSAGES).sort()).toEqual([
      'corrupt-archive',
      'duplicate-file',
      'history-unavailable',
      'missing-activities-csv',
      'no-eligible-rides',
      'not-a-zip',
      'save-failed',
      'too-large',
    ]);
  });

  it('AC-41: names the earlier upload of a file that was already imported', () => {
    const earlier = {
      uploadId: '00000000-0000-4000-8000-000000000001',
      fileName: 'export_2025.zip',
      fileSizeBytes: 1,
      fileHash: 'a'.repeat(64),
      uploadedAt: '2026-03-04T23:30:00.000Z',
      status: 'complete' as const,
      rideCount: 1,
      newRideCount: 1,
      totalDistanceKm: 1,
      skippedCount: 0,
      excludedNonRideCount: 0,
    };

    expect(describeUploadFailure('duplicate-file', earlier, 'UTC')).toBe(
      'This file was already imported on Mar 4, 2026 as “export_2025.zip”. Nothing was imported again.',
    );
    expect(describeUploadFailure('duplicate-file', earlier, 'Asia/Tokyo')).toContain('Mar 5, 2026');
    expect(describeUploadFailure('duplicate-file', null)).toBe(
      IMPORT_FAILURE_MESSAGES['duplicate-file'],
    );
    expect(describeUploadFailure('not-a-zip', earlier)).toBe(IMPORT_FAILURE_MESSAGES['not-a-zip']);
  });

  it('AC-17: tells the user the size limit when a file is too large', () => {
    expect(IMPORT_FAILURE_MESSAGES['too-large']).toContain('5 GB');
  });

  it('groups issues by reason, most frequent first', () => {
    const groups = groupIssuesByReason([
      issue('malformed-file'),
      issue('missing-gps-file'),
      issue('missing-gps-file'),
      issue('no-usable-gps'),
      issue('missing-gps-file'),
    ]);

    expect(groups).toEqual([
      { reason: 'missing-gps-file', label: IMPORT_ISSUE_LABELS['missing-gps-file'], count: 3 },
      { reason: 'malformed-file', label: IMPORT_ISSUE_LABELS['malformed-file'], count: 1 },
      { reason: 'no-usable-gps', label: IMPORT_ISSUE_LABELS['no-usable-gps'], count: 1 },
    ]);
  });

  it('returns no groups when there are no issues', () => {
    expect(groupIssuesByReason([])).toEqual([]);
  });

  it.each([
    [0, 'ride', '0 rides'],
    [1, 'ride', '1 ride'],
    [1234, 'ride', '1,234 rides'],
  ])('pluralize(%s, %s) → %s', (count, word, expected) => {
    expect(pluralize(count, word)).toBe(expected);
  });

  it('supports irregular plurals', () => {
    expect(pluralize(2, 'activity', 'activities')).toBe('2 activities');
  });
});

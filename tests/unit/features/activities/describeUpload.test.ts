import { describe, expect, it } from 'vitest';
import {
  UPLOAD_STATUS_LABELS,
  describeDeletionQuestion,
  describeDeletionResult,
  describeUpload,
} from '@/features/activities/utils/describeUpload';
import type { UploadRecord } from '@/types';

const upload = (patch: Partial<UploadRecord> = {}): UploadRecord => ({
  uploadId: '00000000-0000-4000-8000-000000000001',
  fileName: 'export_2025.zip',
  fileSizeBytes: 1000,
  fileHash: 'a'.repeat(64),
  uploadedAt: '2026-11-19T10:05:00.000Z',
  status: 'complete',
  rideCount: 3,
  newRideCount: 1,
  totalDistanceKm: 1234.56,
  skippedCount: 0,
  excludedNonRideCount: 0,
  ...patch,
});

describe('AC-36: upload registry rows', () => {
  it('shows file name, date and time, rides, distance and status', () => {
    expect(describeUpload(upload(), 'UTC')).toEqual({
      uploadId: '00000000-0000-4000-8000-000000000001',
      fileName: 'export_2025.zip',
      uploadedAt: 'Nov 19, 2026, 10:05 AM',
      rides: '3 rides (1 new)',
      distance: '1,234.6 km',
      status: 'complete',
      statusLabel: 'Complete',
      statusTone: 'ok',
    });
  });

  it('uses the singular and handles an upload with no distance', () => {
    expect(
      describeUpload(upload({ rideCount: 1, newRideCount: 0, totalDistanceKm: 0 })),
    ).toMatchObject({
      rides: '1 ride (0 new)',
      distance: '0.0 km',
    });
  });

  it('names every status in words, not only by colour', () => {
    expect(Object.keys(UPLOAD_STATUS_LABELS).sort()).toEqual([
      'complete',
      'failed',
      'importing',
      'partial',
    ]);
    expect(describeUpload(upload({ status: 'partial' }))).toMatchObject({
      statusLabel: 'Complete, some rides skipped',
      statusTone: 'warning',
    });
    expect(describeUpload(upload({ status: 'failed' }))).toMatchObject({
      statusLabel: 'Failed',
      statusTone: 'error',
    });
  });
});

describe('BR-35 / BR-36: deletion texts', () => {
  it('asks about one upload by name, or about several by count, and says what stays', () => {
    expect(describeDeletionQuestion(['a.zip'])).toBe(
      'Delete “a.zip”? Rides that are only in this upload are removed from this device; rides that another upload also contains are kept.',
    );
    expect(describeDeletionQuestion(['a.zip', 'b.zip'])).toMatch(
      /^Delete 2 uploads\? Rides that are only in these uploads are removed/,
    );
  });

  it('reports what a deletion removed', () => {
    expect(describeDeletionResult({ deletedUploads: 1, deletedRides: 0 })).toBe(
      'Deleted 1 upload and 0 rides.',
    );
    expect(describeDeletionResult({ deletedUploads: 2, deletedRides: 1 })).toBe(
      'Deleted 2 uploads and 1 ride.',
    );
  });
});

// @vitest-environment node
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { prepareUpload } from '@/features/activities/services/prepareUpload';
import { restoreHistory, transferablesOf } from '@/features/activities/services/restoreHistory';
import { decodeRideHistory } from '@/features/activities/services/rideHistoryBundle';
import { buildSegmentIndex } from '@/features/heatmap/services/buildSegmentIndex';
import { computeBounds } from '@/features/heatmap/utils/bounds';
import { encodeRideBundle } from '@/services/ride-history/rideBundle';
import type { ArchiveUploadResult, ImportStatus } from '@/types';
import { validateUploadBundle } from '../../server/rides/validateUpload';
import { makeSampleExport, makeSharedRoadExport } from '../fixtures/stravaExport';

const zipBlob = (bytes: Uint8Array) => new Blob([bytes as Uint8Array<ArrayBuffer>]);

function expectOk(result: ArchiveUploadResult) {
  if (!result.ok) throw new Error(`Expected a processed export, got ${result.reason}`);
  return result;
}

describe('BR-33 / BR-37: preparing an export for upload', () => {
  it('hashes the whole file with SHA-256 while reading it', async () => {
    const zip = makeSampleExport();

    const result = expectOk(await prepareUpload(zipBlob(zip), 'export.zip'));

    expect(result.fileHash).toBe(createHash('sha256').update(zip).digest('hex'));
  });

  it('gives the same file the same hash, and a different file another', async () => {
    const zip = makeSampleExport();

    const first = expectOk(await prepareUpload(zipBlob(zip), 'a.zip'));
    const renamed = expectOk(await prepareUpload(zipBlob(zip), 'renamed.zip'));
    const other = expectOk(await prepareUpload(zipBlob(makeSharedRoadExport()), 'a.zip'));

    expect(renamed.fileHash).toBe(first.fileHash);
    expect(other.fileHash).not.toBe(first.fileHash);
  });

  it('builds an upload bundle the backend accepts, with every ride and its full track', async () => {
    const result = expectOk(await prepareUpload(zipBlob(makeSampleExport()), 'export_1.zip'));

    const validation = validateUploadBundle(result.bundle);

    expect(validation.ok).toBe(true);
    if (!validation.ok) return;
    expect(validation.value.upload).toEqual({
      fileName: 'export_1.zip',
      fileSizeBytes: makeSampleExport().byteLength,
      fileHash: result.fileHash,
      skippedCount: result.issues.length,
      excludedNonRideCount: result.excludedNonRideCount,
    });
    expect(validation.value.rides).toHaveLength(result.rideCount);
    expect(result.rideCount).toBe(3);
    expect(validation.value.rides.every((ride) => ride.points.length >= 2)).toBe(true);
  });

  it('reports the same progress as the archive import', async () => {
    const statuses: ImportStatus[] = [];

    await prepareUpload(zipBlob(makeSampleExport()), 'x.zip', (status) => statuses.push(status));

    expect(statuses[0]).toEqual({ stage: 'reading-archive' });
    expect(statuses.at(-1)).toMatchObject({ stage: 'parsing-activities', processed: 6 });
  });

  it('AC-16: returns the archive failure without a hash or bundle', async () => {
    const result = await prepareUpload(zipBlob(new TextEncoder().encode('not a zip')), 'x.zip');

    expect(result).toEqual({ ok: false, reason: 'not-a-zip' });
  });
});

describe('BR-33 / AC-34: restoring the stored history', () => {
  it('decodes the stored rides as the import produced them, and indexes them', async () => {
    const prepared = expectOk(await prepareUpload(zipBlob(makeSampleExport()), 'export.zip'));
    const statuses: ImportStatus[] = [];

    const restored = restoreHistory(prepared.bundle, (status) => statuses.push(status));

    const imported = decodeRideHistory(prepared.bundle);
    expect(restored.activities.map((a) => a.activityId)).toEqual(
      imported.activities.map((a) => a.activityId),
    );
    expect(restored.skippedCount).toBe(0);
    expect(restored.segmentIndex.activitySegments.size).toBe(3);
    // NFR-10: the page gets summaries and the bounds, never the tracks.
    expect(restored.activities.every((activity) => !('gpsTrack' in activity))).toBe(true);
    expect(restored.bounds).toEqual(computeBounds(imported.activities));
    expect(restored.segmentIndex).toEqual(buildSegmentIndex(imported.activities));
    expect(statuses).toEqual([{ stage: 'indexing' }]);
  });

  it('lists every buffer of the index, so it can be moved to the page, each once', async () => {
    const prepared = expectOk(await prepareUpload(zipBlob(makeSampleExport()), 'export.zip'));
    const restored = restoreHistory(prepared.bundle);
    const index = restored.segmentIndex;

    const buffers = transferablesOf(restored);

    expect(new Set(buffers).size).toBe(buffers.length);
    for (const array of [index.cellLngLat, index.segmentCells, index.cellSegments]) {
      expect(buffers).toContain(array.buffer);
    }
    for (const segments of index.activitySegments.values()) {
      expect(buffers).toContain(segments.buffer);
    }
  });

  it('restores an empty history', () => {
    const restored = restoreHistory(encodeRideBundle({ rideCount: 0 }, []));

    expect(restored.activities).toEqual([]);
    expect(restored.segmentIndex.activitySegments.size).toBe(0);
  });
});

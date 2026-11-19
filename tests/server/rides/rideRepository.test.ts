// @vitest-environment node
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cellsForTrack } from '../../../src/services/ride-history/rideCells';
import { decodeTrack } from '../../../src/services/ride-history/trackCodec';
import { openRideDatabase } from '../../../server/rides/rideDatabase';
import { createRideRepository, type RideRepository } from '../../../server/rides/rideRepository';
import { ride, track, upload } from '../rideFixtures';

let db: DatabaseSync;
let repository: RideRepository;

beforeEach(() => {
  db = openRideDatabase(':memory:');
  repository = createRideRepository(db);
});
afterEach(() => {
  repository.close();
});

const storedIds = () => repository.listRides().map((r) => r.details.activityId);
const count = (table: string) =>
  (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

function importOk(...args: Parameters<RideRepository['importUpload']>) {
  const result = repository.importUpload(...args);
  if (!result.ok) throw new Error('expected the import to succeed');
  return result.upload;
}

describe('BR-33: ride persistence', () => {
  it('stores rides with their details and complete GPS track', () => {
    const points = track(51.5, -0.12, 7);
    importOk(upload(1, [ride('1', { activityName: 'Commute' }, points)]));

    const [stored] = repository.listRides();
    expect(stored?.details).toMatchObject({ activityId: '1', activityName: 'Commute' });
    expect(decodeTrack(stored!.track)).toEqual(points); // ! safe: one ride was just stored
  });

  it('lists rides by start date', () => {
    importOk(
      upload(1, [
        ride('1', { activityDate: '2024-05-01T08:00:00.000Z' }),
        ride('2', { activityDate: '2023-01-01T08:00:00.000Z' }),
      ]),
    );

    expect(storedIds()).toEqual(['2', '1']);
  });

  it('indexes the cells of each new ride (ADR-0013 §5)', () => {
    const points = track(51.5, -0.12, 30);
    importOk(upload(1, [ride('1', {}, points)]));

    const cells = db
      .prepare('SELECT cell_key FROM ride_cells WHERE activity_id = ? ORDER BY cell_key')
      .all('1')
      .map((row) => (row as { cell_key: number }).cell_key);
    expect(cells).toEqual(cellsForTrack(points));
  });
});

describe('BR-34: upload registry', () => {
  it('records file name, time, hash, ride count, distance and status', () => {
    const now = new Date('2026-11-19T10:00:00.000Z');
    const stored = importOk(
      upload(7, [ride('1', { distanceKm: 12.5 }), ride('2', { distanceKm: null })], {
        excludedNonRideCount: 3,
      }),
      now,
    );

    expect(stored).toMatchObject({
      fileName: 'export_7.zip',
      fileSizeBytes: 1007,
      uploadedAt: '2026-11-19T10:00:00.000Z',
      status: 'complete',
      rideCount: 2,
      newRideCount: 2,
      totalDistanceKm: 12.5,
      skippedCount: 0,
      excludedNonRideCount: 3,
    });
    expect(stored.fileHash).toMatch(/^0+7$/);
    expect(stored.uploadId).toMatch(/^[0-9a-f-]{36}$/);
    expect(repository.listUploads()).toEqual([stored]);
  });

  it('marks an upload with skipped Ride activities as partial', () => {
    expect(importOk(upload(1, [ride('1')], { skippedCount: 2 })).status).toBe('partial');
  });

  it('lists uploads newest first', () => {
    importOk(upload(1, [ride('1')]), new Date('2026-01-01T00:00:00Z'));
    importOk(upload(2, [ride('2')]), new Date('2026-02-01T00:00:00Z'));

    expect(repository.listUploads().map((u) => u.fileName)).toEqual([
      'export_2.zip',
      'export_1.zip',
    ]);
  });

  it('marks an upload left importing by a crash as failed when reopened', () => {
    db.prepare(
      `INSERT INTO uploads (upload_id, file_name, file_size_bytes, file_hash, uploaded_at, status)
       VALUES ('00000000-0000-4000-8000-000000000000', 'x.zip', 1, ?, '2026-01-01T00:00:00Z', 'importing')`,
    ).run('f'.repeat(64));

    const reopened = createRideRepository(db);

    expect(reopened.listUploads()[0]?.status).toBe('failed');
  });
});

describe('BR-16 / BR-18 / RULE-21: cumulative uploads', () => {
  it('AC-35: adds a second upload without replacing the first', () => {
    importOk(upload(1, [ride('1'), ride('2')]));
    importOk(upload(2, [ride('3')]));

    expect(storedIds()).toEqual(['1', '2', '3']);
    expect(repository.listUploads()).toHaveLength(2);
  });

  it('AC-18: stores a ride in several uploads once and links it to each', () => {
    importOk(upload(1, [ride('1'), ride('2')]));
    const second = importOk(upload(2, [ride('2'), ride('3')]));

    expect(storedIds()).toEqual(['1', '2', '3']);
    expect(second).toMatchObject({ rideCount: 2, newRideCount: 1, totalDistanceKm: 20 });
    expect(count('upload_rides')).toBe(4);
  });

  it('keeps the first entry when one upload lists an activity twice', () => {
    const stored = importOk(
      upload(1, [ride('1', { activityName: 'First' }), ride('1', { activityName: 'Again' })]),
    );

    expect(stored.rideCount).toBe(1);
    expect(repository.listRides()[0]?.details.activityName).toBe('First');
  });

  it('RULE-22: a newer upload replaces the details and keeps the stored track', () => {
    const original = track(10, 20, 5);
    importOk(upload(1, [ride('1', { activityName: 'Old name' }, original)]));
    importOk(upload(2, [ride('1', { activityName: 'Renamed', distanceKm: 11 }, track(30, 40, 9))]));

    const [stored] = repository.listRides();
    expect(stored?.details).toMatchObject({ activityName: 'Renamed', distanceKm: 11 });
    expect(decodeTrack(stored!.track)).toEqual(original); // ! safe: one ride is stored
  });
});

describe('BR-37: duplicate file detection', () => {
  it('AC-41: refuses a file with the same hash and names the earlier upload', () => {
    const first = importOk(upload(1, [ride('1')]));

    const again = repository.importUpload(upload(1, [ride('2')], { fileName: 'renamed.zip' }));

    expect(again).toEqual({ ok: false, reason: 'duplicate-file', existing: first });
    expect(storedIds()).toEqual(['1']);
    expect(repository.listUploads()).toHaveLength(1);
  });

  it('finds imported uploads by hash, but not failed ones (RULE-23)', () => {
    const first = importOk(upload(1, [ride('1')]));
    db.prepare(`UPDATE uploads SET status = 'failed'`).run();

    expect(repository.findImportedUpload(first.fileHash)).toBeNull();
    expect(repository.importUpload(upload(1, [ride('1')])).ok).toBe(true);
  });

  it('imports a different file even when all of its rides are stored', () => {
    importOk(upload(1, [ride('1')]));

    expect(importOk(upload(2, [ride('1')]))).toMatchObject({ rideCount: 1, newRideCount: 0 });
  });
});

describe('BR-33: atomic import', () => {
  it('stores nothing from an upload that fails part-way, and records it as failed', () => {
    importOk(upload(1, [ride('1')]));
    db.exec(`CREATE TRIGGER fail_ride_3 BEFORE INSERT ON rides WHEN NEW.activity_id = '3'
             BEGIN SELECT RAISE(ABORT, 'simulated failure'); END`);

    expect(() => repository.importUpload(upload(2, [ride('2'), ride('3')]))).toThrow(/simulated/);

    expect(storedIds()).toEqual(['1']);
    expect(
      repository
        .listUploads()
        .map((u) => u.status)
        .sort(),
    ).toEqual(['complete', 'failed']);
    expect(count('upload_rides')).toBe(1);
  });
});

describe('BR-36: upload deletion', () => {
  it('AC-37: deletes only the rides that no remaining upload contains', () => {
    const first = importOk(upload(1, [ride('1'), ride('2')]));
    importOk(upload(2, [ride('2'), ride('3')]));

    expect(repository.deleteUploads([first.uploadId])).toEqual({
      ok: true,
      deletedUploads: 1,
      deletedRides: 1,
    });
    expect(storedIds()).toEqual(['2', '3']);
    expect(repository.listUploads().map((u) => u.fileName)).toEqual(['export_2.zip']);
  });

  it('removes the cells of deleted rides and keeps the others', () => {
    const first = importOk(upload(1, [ride('1')]));
    importOk(upload(2, [ride('2')]));
    const before = count('ride_cells');

    repository.deleteUploads([first.uploadId]);

    expect(count('ride_cells')).toBe(before - cellsForTrack(track(10.01)).length);
    expect(
      db.prepare(`SELECT COUNT(*) AS n FROM ride_cells WHERE activity_id = '1'`).get(),
    ).toEqual({ n: 0 });
  });

  it('AC-38: deletes several uploads together', () => {
    const a = importOk(upload(1, [ride('1')]));
    const b = importOk(upload(2, [ride('1'), ride('2')]));
    importOk(upload(3, [ride('3')]));

    expect(repository.deleteUploads([a.uploadId, b.uploadId])).toMatchObject({
      deletedUploads: 2,
      deletedRides: 2,
    });
    expect(storedIds()).toEqual(['3']);
  });

  it('deletes a failed upload, which has no rides', () => {
    importOk(upload(1, [ride('1')]));
    db.exec(`CREATE TRIGGER fail BEFORE INSERT ON rides BEGIN SELECT RAISE(ABORT, 'x'); END`);
    expect(() => repository.importUpload(upload(2, [ride('2')]))).toThrow();
    const failed = repository.listUploads().find((u) => u.status === 'failed');

    expect(repository.deleteUploads([failed!.uploadId])).toMatchObject({ deletedRides: 0 }); // ! safe: asserted to exist by the import above
    expect(storedIds()).toEqual(['1']);
  });

  it('deletes nothing when one of the IDs is unknown', () => {
    const a = importOk(upload(1, [ride('1')]));
    const unknown = '00000000-0000-4000-8000-000000000000';

    expect(repository.deleteUploads([a.uploadId, unknown])).toEqual({
      ok: false,
      reason: 'not-found',
      missing: [unknown],
    });
    expect(storedIds()).toEqual(['1']);
  });

  it('AC-40: a deletion that fails part-way removes nothing', () => {
    const a = importOk(upload(1, [ride('1'), ride('2')]));
    const b = importOk(upload(2, [ride('3')]));
    db.exec(`CREATE TRIGGER fail_delete BEFORE DELETE ON rides WHEN OLD.activity_id = '3'
             BEGIN SELECT RAISE(ABORT, 'simulated failure'); END`);

    expect(() => repository.deleteUploads([a.uploadId, b.uploadId])).toThrow(/simulated/);

    expect(storedIds()).toEqual(['1', '2', '3']);
    expect(repository.listUploads()).toHaveLength(2);
    expect(count('upload_rides')).toBe(3);
  });

  it('AC-39: delete all removes every upload, ride, link and cell', () => {
    importOk(upload(1, [ride('1'), ride('2')]));
    importOk(upload(2, [ride('2'), ride('3')]));

    expect(repository.deleteAll()).toEqual({ deletedUploads: 2, deletedRides: 3 });
    for (const table of ['uploads', 'rides', 'upload_rides', 'ride_cells']) {
      expect(count(table)).toBe(0);
    }
  });
});

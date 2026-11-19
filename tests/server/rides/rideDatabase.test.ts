// @vitest-environment node
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  backupPath,
  NewerRideDatabaseError,
  openRideDatabase,
  RIDE_MIGRATIONS,
} from '../../../server/rides/rideDatabase';
import { openRideRepository } from '../../../server/rides/rideRepository';
import { ride, upload } from '../rideFixtures';

let dir: string;
let path: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'rides-db-'));
  path = join(dir, 'nested', 'rides.sqlite');
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const userVersion = (db: DatabaseSync) =>
  (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;

describe('BR-33: ride database file', () => {
  it('AC-34: keeps rides and uploads across restarts', () => {
    const first = openRideRepository(path);
    first.importUpload(upload(1, [ride('1'), ride('2')]));
    first.close();

    const reopened = openRideRepository(path);
    expect(reopened.listRides().map((r) => r.details.activityId)).toEqual(['1', '2']);
    expect(reopened.listUploads()).toHaveLength(1);
    reopened.close();
  });

  it('creates the folder and the current schema', () => {
    const db = openRideDatabase(path);

    expect(userVersion(db)).toBe(RIDE_MIGRATIONS.length);
    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`)
      .all()
      .map((row) => (row as { name: string }).name);
    expect(tables).toEqual(['ride_cells', 'rides', 'upload_rides', 'uploads']);
    db.close();
  });

  it('indexes ride dates, upload IDs and location cells (ADR-0013 §2)', () => {
    const db = openRideDatabase(':memory:');
    const plan = (sql: string) =>
      db
        .prepare(`EXPLAIN QUERY PLAN ${sql}`)
        .all()
        .map((row) => (row as { detail: string }).detail)
        .join(' | ');

    expect(plan(`SELECT * FROM rides WHERE start_date >= '2024'`)).toMatch(/rides_by_start_date/);
    // Restoring reads every track in date order: the index must give that order, so the
    // ~100 MB of tracks are never copied into a sort (NFR-10).
    expect(plan('SELECT track FROM rides ORDER BY start_date, activity_id')).not.toMatch(
      /TEMP B-TREE/,
    );
    expect(plan(`SELECT * FROM upload_rides WHERE activity_id = '1'`)).toMatch(
      /upload_rides_by_activity/,
    );
    expect(plan(`SELECT * FROM upload_rides WHERE upload_id = 'x'`)).toMatch(/PRIMARY KEY/);
    expect(plan(`SELECT * FROM ride_cells WHERE cell_key BETWEEN 1 AND 9`)).toMatch(/PRIMARY KEY/);
    expect(plan(`SELECT * FROM uploads WHERE file_hash = 'x'`)).toMatch(/uploads_by_hash/);
    db.close();
  });
});

describe('BR-33: safe schema migration', () => {
  const nextVersion = [...RIDE_MIGRATIONS, 'ALTER TABLE rides ADD COLUMN note TEXT'];

  it('copies an existing database before upgrading it, and keeps its data', () => {
    const repository = openRideRepository(path);
    repository.importUpload(upload(1, [ride('1')]));
    repository.close();

    const db = openRideDatabase(path, nextVersion);

    expect(userVersion(db)).toBe(2);
    expect(db.prepare('SELECT activity_id, note FROM rides').all()).toEqual([
      { activity_id: '1', note: null },
    ]);
    db.close();
    const backup = new DatabaseSync(backupPath(path, 1));
    expect(userVersion(backup)).toBe(1);
    expect(backup.prepare('SELECT COUNT(*) AS n FROM rides').get()).toEqual({ n: 1 });
    backup.close();
  });

  it('does not back up a new database', () => {
    openRideDatabase(path).close();

    expect(existsSync(backupPath(path, 0))).toBe(false);
  });

  it('rolls back a failing migration and leaves the previous schema', () => {
    openRideDatabase(path).close();

    expect(() => openRideDatabase(path, [...RIDE_MIGRATIONS, 'NOT SQL'])).toThrow();

    const db = openRideDatabase(path);
    expect(userVersion(db)).toBe(RIDE_MIGRATIONS.length);
    db.close();
  });

  it('refuses a database from a newer version without changing it', () => {
    openRideDatabase(path, nextVersion).close();

    expect(() => openRideDatabase(path)).toThrow(NewerRideDatabaseError);

    const db = new DatabaseSync(path);
    expect(userVersion(db)).toBe(2);
    db.close();
  });
});

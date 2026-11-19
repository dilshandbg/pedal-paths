import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/*
 * Local SQLite database of the ride history and upload registry (BR-33, BR-34, ADR-0013). Uses
 * Node's built-in `node:sqlite`, so there is no database dependency. Separate from the segment
 * catalog and from the legacy segment database (BR-30). Deleting the file, with the app stopped,
 * removes all ride data (NFR-09).
 */

/** Ordered schema migrations; `PRAGMA user_version` records how many have run. */
export const RIDE_MIGRATIONS: readonly string[] = [
  `CREATE TABLE uploads (
     upload_id                TEXT PRIMARY KEY,
     file_name                TEXT NOT NULL,
     file_size_bytes          INTEGER NOT NULL,
     file_hash                TEXT NOT NULL,
     uploaded_at              TEXT NOT NULL,
     status                   TEXT NOT NULL
                                CHECK (status IN ('importing', 'complete', 'partial', 'failed')),
     ride_count               INTEGER NOT NULL DEFAULT 0,
     new_ride_count           INTEGER NOT NULL DEFAULT 0,
     total_distance_km        REAL    NOT NULL DEFAULT 0,
     skipped_count            INTEGER NOT NULL DEFAULT 0,
     excluded_non_ride_count  INTEGER NOT NULL DEFAULT 0
   ) STRICT;
   CREATE INDEX uploads_by_hash ON uploads (file_hash, status);
   CREATE INDEX uploads_by_date ON uploads (uploaded_at);

   CREATE TABLE rides (
     activity_id        TEXT PRIMARY KEY,
     name               TEXT NOT NULL,
     start_date         TEXT NOT NULL,
     distance_km        REAL,
     elevation_gain_m   REAL,
     moving_time_s      REAL,
     point_count        INTEGER NOT NULL,
     min_lat            REAL NOT NULL,
     max_lat            REAL NOT NULL,
     min_lng            REAL NOT NULL,
     max_lng            REAL NOT NULL,
     track              BLOB NOT NULL,
     updated_by_upload  TEXT REFERENCES uploads (upload_id) ON DELETE SET NULL
   ) STRICT;
   CREATE INDEX rides_by_start_date ON rides (start_date, activity_id);

   CREATE TABLE upload_rides (
     upload_id    TEXT NOT NULL REFERENCES uploads (upload_id) ON DELETE CASCADE,
     activity_id  TEXT NOT NULL REFERENCES rides (activity_id) ON DELETE CASCADE,
     PRIMARY KEY (upload_id, activity_id)
   ) STRICT, WITHOUT ROWID;
   CREATE INDEX upload_rides_by_activity ON upload_rides (activity_id);

   CREATE TABLE ride_cells (
     cell_key     INTEGER NOT NULL,
     activity_id  TEXT NOT NULL REFERENCES rides (activity_id) ON DELETE CASCADE,
     PRIMARY KEY (cell_key, activity_id)
   ) STRICT, WITHOUT ROWID;
   CREATE INDEX ride_cells_by_activity ON ride_cells (activity_id);`,
];

/** The database file was written by a newer version of the application. */
export class NewerRideDatabaseError extends Error {
  constructor(found: number, supported: number) {
    super(`Ride database schema ${found} is newer than this application (${supported}).`);
    this.name = 'NewerRideDatabaseError';
  }
}

/** Path of the copy taken before upgrading a database from schema `version`. */
export const backupPath = (path: string, version: number) => `${path}.v${version}.bak`;

/**
 * Opens (creating if needed) the ride database at `path`, or in memory for `':memory:'`, and
 * brings its schema up to date. Before an existing file is upgraded, it is copied to
 * {@link backupPath}; a database newer than `migrations` is closed untouched.
 */
export function openRideDatabase(
  path: string,
  migrations: readonly string[] = RIDE_MIGRATIONS,
): DatabaseSync {
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = new DatabaseSync(path);
  try {
    db.exec('PRAGMA foreign_keys = ON');
    if (path !== ':memory:') {
      db.exec('PRAGMA journal_mode = WAL');
    }
    migrate(db, path, migrations);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

function migrate(db: DatabaseSync, path: string, migrations: readonly string[]): void {
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number } | undefined;
  const current = row?.user_version ?? 0;
  if (current > migrations.length) {
    throw new NewerRideDatabaseError(current, migrations.length);
  }
  if (current === migrations.length) return;

  if (current > 0 && path !== ':memory:') {
    const copy = backupPath(path, current);
    if (!existsSync(copy)) {
      db.prepare('VACUUM INTO ?').run(copy);
    }
  }
  for (let version = current; version < migrations.length; version += 1) {
    db.exec('BEGIN');
    try {
      db.exec(migrations[version] ?? '');
      db.exec(`PRAGMA user_version = ${version + 1}`);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
}

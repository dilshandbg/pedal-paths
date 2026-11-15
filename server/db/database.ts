import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/*
 * Local SQLite storage for imported segments (ADR-0009, BR-23). Uses Node's built-in `node:sqlite`,
 * so there is no database dependency. The file holds only what the user imported; deleting it
 * removes all segment data (README → "Removing stored data").
 */

/** Ordered schema migrations; `PRAGMA user_version` records how many have run. */
const MIGRATIONS: readonly string[] = [
  `CREATE TABLE segments (
     segment_id         TEXT PRIMARY KEY,
     name               TEXT NOT NULL,
     distance_m         REAL,
     elevation_gain_m   REAL,
     average_grade      REAL,
     maximum_grade      REAL,
     elevation_high_m   REAL,
     elevation_low_m    REAL,
     city               TEXT,
     state              TEXT,
     country            TEXT,
     start_lat          REAL,
     start_lng          REAL,
     end_lat            REAL,
     end_lng            REAL,
     route_json         TEXT,
     pr_elapsed_time_s  INTEGER,
     pr_date            TEXT,
     effort_count       INTEGER,
     source_file        TEXT,
     imported_at        TEXT NOT NULL,
     updated_at         TEXT NOT NULL
   ) STRICT;
   CREATE TABLE segment_efforts (
     segment_id      TEXT NOT NULL REFERENCES segments (segment_id) ON DELETE CASCADE,
     effort_key      TEXT NOT NULL,
     effort_id       TEXT,
     activity_id     TEXT,
     start_date      TEXT NOT NULL,
     elapsed_time_s  INTEGER NOT NULL,
     moving_time_s   INTEGER,
     PRIMARY KEY (segment_id, effort_key)
   ) STRICT;
   CREATE INDEX segment_efforts_by_segment ON segment_efforts (segment_id, elapsed_time_s, start_date);`,
];

export const SCHEMA_VERSION = MIGRATIONS.length;

/** Opens (creating if needed) the database at `path`, or in memory for `':memory:'`, migrated. */
export function openDatabase(path: string): DatabaseSync {
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = new DatabaseSync(path);
  try {
    db.exec('PRAGMA foreign_keys = ON');
    if (path !== ':memory:') {
      db.exec('PRAGMA journal_mode = WAL');
    }
    migrate(db);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

function migrate(db: DatabaseSync): void {
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number } | undefined;
  const current = row?.user_version ?? 0;
  if (current > SCHEMA_VERSION) {
    throw new Error(
      `Segment database schema ${current} is newer than this application (${SCHEMA_VERSION}).`,
    );
  }
  for (let version = current; version < SCHEMA_VERSION; version += 1) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[version] ?? '');
      db.exec(`PRAGMA user_version = ${version + 1}`);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
}

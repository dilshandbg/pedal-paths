import { randomUUID } from 'node:crypto';
import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import type {
  EncodedRide,
  UploadDeletionResult,
  UploadId,
  UploadRecord,
  UploadStatus,
} from '../../src/types/rideHistory';
import { cellsForTrack, trackBounds } from '../../src/services/ride-history/rideCells';
import { openRideDatabase } from './rideDatabase';
import type { ValidUpload } from './validateUpload';

export type ImportUploadResult =
  | { readonly ok: true; readonly upload: UploadRecord }
  | { readonly ok: false; readonly reason: 'duplicate-file'; readonly existing: UploadRecord };

export type DeleteUploadsResult =
  | ({ readonly ok: true } & UploadDeletionResult)
  | { readonly ok: false; readonly reason: 'not-found'; readonly missing: readonly UploadId[] };

/** Ride history and upload registry as the local API uses them (ADR-0013). */
export interface RideRepository {
  /** Every upload in the registry, newest first (BR-34). */
  listUploads(): UploadRecord[];
  /** The imported (complete or partial) upload of a file with this hash, if any (RULE-23). */
  findImportedUpload(fileHash: string): UploadRecord | null;
  /**
   * Adds an upload and its rides (BR-16, BR-33). Rides already stored are linked to it, with
   * their details replaced and their track kept (RULE-21, RULE-22). Refuses a file that was
   * already imported (BR-37). Either every ride is stored or none is, and the upload is then
   * recorded as failed.
   */
  importUpload(input: ValidUpload, now?: Date): ImportUploadResult;
  /** Every stored ride, by start date, with its encoded track (AC-34). */
  listRides(): EncodedRide[];
  /**
   * Deletes uploads and the rides no remaining upload contains, in one transaction (BR-36).
   * If any ID is unknown, nothing is deleted.
   */
  deleteUploads(uploadIds: readonly UploadId[]): DeleteUploadsResult;
  /** Deletes every upload and all ride data (BR-35, AC-39). */
  deleteAll(): UploadDeletionResult;
  close(): void;
}

interface UploadRow {
  upload_id: string;
  file_name: string;
  file_size_bytes: number;
  file_hash: string;
  uploaded_at: string;
  status: UploadStatus;
  ride_count: number;
  new_ride_count: number;
  total_distance_km: number;
  skipped_count: number;
  excluded_non_ride_count: number;
}

interface RideRow {
  activity_id: string;
  name: string;
  start_date: string;
  distance_km: number | null;
  elevation_gain_m: number | null;
  moving_time_s: number | null;
  track: Uint8Array;
}

const toUpload = (row: UploadRow): UploadRecord => ({
  uploadId: row.upload_id,
  fileName: row.file_name,
  fileSizeBytes: row.file_size_bytes,
  fileHash: row.file_hash,
  uploadedAt: row.uploaded_at,
  status: row.status,
  rideCount: row.ride_count,
  newRideCount: row.new_ride_count,
  totalDistanceKm: row.total_distance_km,
  skippedCount: row.skipped_count,
  excludedNonRideCount: row.excluded_non_ride_count,
});

const placeholders = (count: number) => Array.from({ length: count }, () => '?').join(', ');

/** Runs `work` in a transaction: committed when it returns, rolled back when it throws. */
function inTransaction<T>(db: DatabaseSync, work: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

/**
 * A repository over an open ride database (`openRideDatabase`). Uploads left `importing` by a
 * crash are marked failed: their rides were never committed.
 */
// Implements: BR-33, BR-34, BR-36, BR-37
export function createRideRepository(db: DatabaseSync): RideRepository {
  db.exec(`UPDATE uploads SET status = 'failed' WHERE status = 'importing'`);

  const selectUpload = db.prepare('SELECT * FROM uploads WHERE upload_id = ?');
  const selectImportedByHash = db.prepare(
    `SELECT * FROM uploads WHERE file_hash = ? AND status IN ('complete', 'partial')
     ORDER BY uploaded_at LIMIT 1`,
  );
  const insertUpload = db.prepare(
    `INSERT INTO uploads (upload_id, file_name, file_size_bytes, file_hash, uploaded_at, status,
       skipped_count, excluded_non_ride_count)
     VALUES (?, ?, ?, ?, ?, 'importing', ?, ?)`,
  );
  const finishUpload = db.prepare(
    `UPDATE uploads SET status = ?, ride_count = ?, new_ride_count = ?, total_distance_km = ?
     WHERE upload_id = ?`,
  );
  const failUpload = db.prepare(`UPDATE uploads SET status = 'failed' WHERE upload_id = ?`);
  const rideExists = db.prepare('SELECT 1 AS found FROM rides WHERE activity_id = ?');
  const insertRide = db.prepare(
    `INSERT INTO rides (activity_id, name, start_date, distance_km, elevation_gain_m,
       moving_time_s, point_count, min_lat, max_lat, min_lng, max_lng, track, updated_by_upload)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const updateRideDetails = db.prepare(
    `UPDATE rides SET name = ?, start_date = ?, distance_km = ?, elevation_gain_m = ?,
       moving_time_s = ?, updated_by_upload = ?
     WHERE activity_id = ?`,
  );
  const insertCell = db.prepare('INSERT INTO ride_cells (cell_key, activity_id) VALUES (?, ?)');
  const linkRide = db.prepare(
    'INSERT OR IGNORE INTO upload_rides (upload_id, activity_id) VALUES (?, ?)',
  );
  const deleteOrphanRides = db.prepare(
    `DELETE FROM rides WHERE NOT EXISTS
       (SELECT 1 FROM upload_rides u WHERE u.activity_id = rides.activity_id)`,
  );

  const getUpload = (uploadId: UploadId): UploadRecord | null => {
    const row = selectUpload.get(uploadId) as UploadRow | undefined;
    return row ? toUpload(row) : null;
  };

  const findImportedUpload = (fileHash: string): UploadRecord | null => {
    const row = selectImportedByHash.get(fileHash) as UploadRow | undefined;
    return row ? toUpload(row) : null;
  };

  return {
    listUploads() {
      const rows = db
        .prepare('SELECT * FROM uploads ORDER BY uploaded_at DESC, upload_id')
        .all() as unknown as UploadRow[];
      return rows.map(toUpload);
    },

    findImportedUpload,

    importUpload({ upload, rides }, now = new Date()) {
      const existing = findImportedUpload(upload.fileHash);
      if (existing) return { ok: false, reason: 'duplicate-file', existing };

      const uploadId = randomUUID();
      // Recorded on its own first, so an import that fails or crashes stays visible (BR-34).
      insertUpload.run(
        uploadId,
        upload.fileName,
        upload.fileSizeBytes,
        upload.fileHash,
        now.toISOString(),
        upload.skippedCount,
        upload.excludedNonRideCount,
      );

      try {
        inTransaction(db, () => {
          const seen = new Set<string>();
          let newRides = 0;
          let totalDistanceKm = 0;
          for (const { details, track, points } of rides) {
            if (seen.has(details.activityId)) continue; // first entry wins (BR-18)
            seen.add(details.activityId);
            totalDistanceKm += details.distanceKm ?? 0;

            if (rideExists.get(details.activityId)) {
              // RULE-22: newest details win; the stored track is kept.
              updateRideDetails.run(
                details.activityName,
                details.activityDate,
                details.distanceKm,
                details.elevationGainM,
                details.movingTimeS,
                uploadId,
                details.activityId,
              );
            } else {
              const bounds = trackBounds(points);
              insertRide.run(
                details.activityId,
                details.activityName,
                details.activityDate,
                details.distanceKm,
                details.elevationGainM,
                details.movingTimeS,
                points.length,
                bounds.south,
                bounds.north,
                bounds.west,
                bounds.east,
                track.slice(), // own copy: `track` may be a view into the request body
                uploadId,
              );
              for (const cell of cellsForTrack(points)) {
                insertCell.run(cell, details.activityId);
              }
              newRides += 1;
            }
            linkRide.run(uploadId, details.activityId);
          }
          finishUpload.run(
            upload.skippedCount > 0 ? 'partial' : 'complete',
            seen.size,
            newRides,
            totalDistanceKm,
            uploadId,
          );
        });
      } catch (error) {
        failUpload.run(uploadId);
        throw error;
      }

      const stored = getUpload(uploadId);
      if (!stored) throw new Error('Stored upload could not be read back.');
      return { ok: true, upload: stored };
    },

    listRides() {
      const rows = db
        .prepare(
          `SELECT activity_id, name, start_date, distance_km, elevation_gain_m, moving_time_s, track
           FROM rides ORDER BY start_date, activity_id`,
        )
        .all() as unknown as RideRow[];
      return rows.map((row) => ({
        details: {
          activityId: row.activity_id,
          activityName: row.name,
          activityDate: row.start_date,
          distanceKm: row.distance_km,
          elevationGainM: row.elevation_gain_m,
          movingTimeS: row.moving_time_s,
        },
        track: row.track,
      }));
    },

    deleteUploads(uploadIds) {
      const ids = [...new Set(uploadIds)];
      if (ids.length === 0) return { ok: true, deletedUploads: 0, deletedRides: 0 };
      return inTransaction(db, (): DeleteUploadsResult => {
        const found = new Set(
          (
            db
              .prepare(`SELECT upload_id FROM uploads WHERE upload_id IN (${placeholders(ids.length)})`)
              .all(...(ids as SQLInputValue[])) as { upload_id: string }[]
          ).map((row) => row.upload_id),
        );
        const missing = ids.filter((id) => !found.has(id));
        if (missing.length > 0) return { ok: false, reason: 'not-found', missing };

        // Cascades to upload_rides; then only rides that no remaining upload contains go (RULE-21),
        // and their cells with them.
        const deletedUploads = db
          .prepare(`DELETE FROM uploads WHERE upload_id IN (${placeholders(ids.length)})`)
          .run(...(ids as SQLInputValue[])).changes;
        const deletedRides = deleteOrphanRides.run().changes;
        return { ok: true, deletedUploads: Number(deletedUploads), deletedRides: Number(deletedRides) };
      });
    },

    deleteAll() {
      const result = inTransaction(db, () => {
        const deletedRides = db.prepare('DELETE FROM rides').run().changes;
        const deletedUploads = db.prepare('DELETE FROM uploads').run().changes;
        return { deletedUploads: Number(deletedUploads), deletedRides: Number(deletedRides) };
      });
      db.exec('VACUUM'); // give the space back: the user asked for the data to be gone
      return result;
    },

    close() {
      db.close();
    },
  };
}

/** Opens the ride database at `path` (`':memory:'` keeps nothing) as a repository. */
export function openRideRepository(path: string): RideRepository {
  return createRideRepository(openRideDatabase(path));
}

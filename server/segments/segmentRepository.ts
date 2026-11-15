import type { DatabaseSync } from 'node:sqlite';
import type {
  Coordinate,
  SegmentDetail,
  SegmentEffortRecord,
  SegmentImportPayload,
  SegmentImportPlan,
  SegmentImportProblem,
  SegmentRecord,
  StoredSegment,
  StoredSegmentEffort,
} from '../../src/types/segment';
import {
  planSegmentImport,
  type StoredSegmentState,
} from '../../src/features/segments/services/planSegmentImport';
import {
  effortKey,
  mergeSegment,
  personalBest,
} from '../../src/features/segments/services/segmentRules';
import { validateSegmentPayload } from '../../src/features/segments/services/validateSegmentPayload';

export type ImportResult =
  | { readonly ok: true; readonly plan: SegmentImportPlan }
  | { readonly ok: false; readonly problems: readonly SegmentImportProblem[] };

export interface SegmentRepository {
  /** Every stored segment with route and personal best, without efforts, by name. */
  list(): StoredSegment[];
  /** One stored segment with its efforts, fastest first; null when not stored. */
  get(segmentId: string): SegmentDetail | null;
  /** Validates an import and classifies it against what is stored. Stores nothing (AC-22). */
  preview(input: unknown): ImportResult;
  /** Validates and stores an import in one transaction (BR-23, BR-24). */
  importPayload(input: unknown, now?: Date): ImportResult;
  /** Removes one segment and its efforts. False when it was not stored (BR-27). */
  remove(segmentId: string): boolean;
  /** Removes all segment data. Returns the number of segments removed (BR-27). */
  removeAll(): number;
  close(): void;
}

type Row = Record<string, unknown>;

const str = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const num = (value: unknown): number | null =>
  typeof value === 'number' ? value : typeof value === 'bigint' ? Number(value) : null;
const point = (lat: unknown, lng: unknown): Coordinate | null => {
  const latitude = num(lat);
  const longitude = num(lng);
  return latitude === null || longitude === null ? null : { latitude, longitude };
};

function parseRoute(value: unknown): Coordinate[] | null {
  if (typeof value !== 'string') return null;
  const positions = JSON.parse(value) as [number, number][];
  return positions.map(([longitude, latitude]) => ({ latitude, longitude }));
}

function toRecord(row: Row): SegmentRecord {
  return {
    segmentId: String(row.segment_id),
    name: String(row.name),
    distanceM: num(row.distance_m),
    elevationGainM: num(row.elevation_gain_m),
    averageGradePct: num(row.average_grade),
    maximumGradePct: num(row.maximum_grade),
    elevationHighM: num(row.elevation_high_m),
    elevationLowM: num(row.elevation_low_m),
    city: str(row.city),
    state: str(row.state),
    country: str(row.country),
    start: point(row.start_lat, row.start_lng),
    end: point(row.end_lat, row.end_lng),
    route: parseRoute(row.route_json),
    prElapsedTimeS: num(row.pr_elapsed_time_s),
    prDate: str(row.pr_date),
    effortCount: num(row.effort_count),
  };
}

function toEffort(row: Row): SegmentEffortRecord {
  return {
    segmentId: String(row.segment_id),
    effortId: str(row.effort_id),
    activityId: str(row.activity_id),
    startDate: String(row.start_date),
    elapsedTimeS: num(row.elapsed_time_s) ?? 0,
    movingTimeS: num(row.moving_time_s),
  };
}

function toStored(row: Row, best: SegmentEffortRecord | null): StoredSegment {
  const record = toRecord(row);
  return {
    ...record,
    sourceFile: str(row.source_file),
    importedAt: String(row.imported_at),
    updatedAt: String(row.updated_at),
    storedEffortCount: num(row.stored_effort_count) ?? 0,
    personalBest: personalBest(record, best ? [best] : []),
  };
}

/** Column values of a segment, in the order of `SEGMENT_COLUMNS`. */
function segmentValues(segment: SegmentRecord) {
  return [
    segment.name,
    segment.distanceM,
    segment.elevationGainM,
    segment.averageGradePct,
    segment.maximumGradePct,
    segment.elevationHighM,
    segment.elevationLowM,
    segment.city,
    segment.state,
    segment.country,
    segment.start?.latitude ?? null,
    segment.start?.longitude ?? null,
    segment.end?.latitude ?? null,
    segment.end?.longitude ?? null,
    segment.route ? JSON.stringify(segment.route.map((p) => [p.longitude, p.latitude])) : null,
    segment.prElapsedTimeS,
    segment.prDate,
    segment.effortCount,
  ];
}

const SEGMENT_COLUMNS = [
  'name',
  'distance_m',
  'elevation_gain_m',
  'average_grade',
  'maximum_grade',
  'elevation_high_m',
  'elevation_low_m',
  'city',
  'state',
  'country',
  'start_lat',
  'start_lng',
  'end_lat',
  'end_lng',
  'route_json',
  'pr_elapsed_time_s',
  'pr_date',
  'effort_count',
];

/** Best effort per segment (RULE-17: fastest, earliest on a tie), joined to the segment row. */
const SELECT_SEGMENTS = `
  WITH ranked AS (
    SELECT segment_id, effort_id, activity_id, start_date, elapsed_time_s, moving_time_s,
           ROW_NUMBER() OVER (PARTITION BY segment_id ORDER BY elapsed_time_s, start_date) AS rank,
           COUNT(*) OVER (PARTITION BY segment_id) AS stored_effort_count
    FROM segment_efforts
  )
  SELECT s.*, r.stored_effort_count,
         r.effort_id AS best_effort_id, r.activity_id AS best_activity_id,
         r.start_date AS best_start_date, r.elapsed_time_s AS best_elapsed_time_s,
         r.moving_time_s AS best_moving_time_s
  FROM segments s
  LEFT JOIN ranked r ON r.segment_id = s.segment_id AND r.rank = 1`;

function bestOf(row: Row): SegmentEffortRecord | null {
  if (row.best_start_date === null || row.best_start_date === undefined) return null;
  return toEffort({
    segment_id: row.segment_id,
    effort_id: row.best_effort_id,
    activity_id: row.best_activity_id,
    start_date: row.best_start_date,
    elapsed_time_s: row.best_elapsed_time_s,
    moving_time_s: row.best_moving_time_s,
  });
}

/**
 * SQLite repository for imported segments (ADR-0009, ADR-0010). Every write goes through the same
 * pure validation and import plan the browser uses, so the review matches what is stored.
 */
// Implements: BR-23, BR-24, BR-27, RULE-16, RULE-17
export function createSegmentRepository(db: DatabaseSync): SegmentRepository {
  const listStatement = db.prepare(
    `${SELECT_SEGMENTS} ORDER BY s.name COLLATE NOCASE, s.segment_id`,
  );
  const getStatement = db.prepare(`${SELECT_SEGMENTS} WHERE s.segment_id = ?`);
  const effortsStatement = db.prepare(
    'SELECT * FROM segment_efforts WHERE segment_id = ? ORDER BY elapsed_time_s, start_date',
  );
  const idsStatement = db.prepare('SELECT segment_id FROM segments');
  const recordStatement = db.prepare('SELECT * FROM segments WHERE segment_id = ?');
  const effortKeysStatement = db.prepare(
    'SELECT effort_key FROM segment_efforts WHERE segment_id = ?',
  );
  const upsertStatement = db.prepare(
    `INSERT INTO segments (segment_id, ${SEGMENT_COLUMNS.join(', ')}, source_file, imported_at, updated_at)
     VALUES (${Array(SEGMENT_COLUMNS.length + 4)
       .fill('?')
       .join(', ')})
     ON CONFLICT (segment_id) DO UPDATE SET
       ${SEGMENT_COLUMNS.map((column) => `${column} = excluded.${column}`).join(', ')},
       source_file = excluded.source_file, updated_at = excluded.updated_at`,
  );
  const touchStatement = db.prepare(
    'UPDATE segments SET source_file = ?, updated_at = ? WHERE segment_id = ?',
  );
  const insertEffortStatement = db.prepare(
    `INSERT OR IGNORE INTO segment_efforts
       (segment_id, effort_key, effort_id, activity_id, start_date, elapsed_time_s, moving_time_s)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const deleteStatement = db.prepare('DELETE FROM segments WHERE segment_id = ?');
  const deleteAllStatement = db.prepare('DELETE FROM segments');

  /** Validates `input` and loads what is stored for the segments it touches. */
  function prepare(input: unknown) {
    const known = new Set(idsStatement.all().map((row) => String(row.segment_id)));
    const validation = validateSegmentPayload(input, known);
    if (!validation.ok) return validation;
    const { payload } = validation;
    const stored = new Map<string, StoredSegmentState>();
    const ids = new Set([
      ...payload.segments.map((segment) => segment.segmentId),
      ...payload.efforts.map((effort) => effort.segmentId),
    ]);
    for (const id of ids) {
      const row = recordStatement.get(id);
      if (!row) continue;
      stored.set(id, {
        record: toRecord(row),
        effortKeys: new Set(effortKeysStatement.all(id).map((key) => String(key.effort_key))),
      });
    }
    return { ok: true as const, payload, stored };
  }

  function apply(
    payload: SegmentImportPayload,
    stored: Map<string, StoredSegmentState>,
    now: Date,
  ) {
    const plan = planSegmentImport(stored, payload);
    const timestamp = now.toISOString();
    const status = new Map(plan.items.map((entry) => [entry.segmentId, entry.status]));
    for (const incoming of payload.segments) {
      const existing = stored.get(incoming.segmentId)?.record ?? null;
      if (status.get(incoming.segmentId) === 'unchanged') continue;
      const merged = mergeSegment(existing, incoming);
      upsertStatement.run(
        merged.segmentId,
        ...segmentValues(merged),
        payload.sourceFile,
        timestamp,
        timestamp,
      );
    }
    const segmentIds = new Set(payload.segments.map((segment) => segment.segmentId));
    for (const entry of plan.items) {
      // Efforts-only update: the segment details stay, the import is recorded.
      if (entry.status === 'update' && !segmentIds.has(entry.segmentId)) {
        touchStatement.run(payload.sourceFile, timestamp, entry.segmentId);
      }
    }
    for (const effort of payload.efforts) {
      insertEffortStatement.run(
        effort.segmentId,
        effortKey(effort),
        effort.effortId,
        effort.activityId,
        effort.startDate,
        effort.elapsedTimeS,
        effort.movingTimeS,
      );
    }
    return plan;
  }

  return {
    list: () => listStatement.all().map((row) => toStored(row, bestOf(row))),

    get(segmentId) {
      const row = getStatement.get(segmentId);
      if (!row) return null;
      const segment = toStored(row, bestOf(row));
      const efforts = effortsStatement.all(segmentId).map(toEffort);
      const bestKey =
        segment.personalBest?.source === 'efforts' && efforts[0] ? effortKey(efforts[0]) : null;
      return {
        ...segment,
        efforts: efforts.map((effort): StoredSegmentEffort => ({
          ...effort,
          isPersonalBest: bestKey !== null && effortKey(effort) === bestKey,
        })),
      };
    },

    preview(input) {
      const prepared = prepare(input);
      if (!prepared.ok) return prepared;
      return { ok: true, plan: planSegmentImport(prepared.stored, prepared.payload) };
    },

    importPayload(input, now = new Date()) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const prepared = prepare(input);
        if (!prepared.ok) {
          db.exec('ROLLBACK');
          return prepared;
        }
        const plan = apply(prepared.payload, prepared.stored, now);
        db.exec('COMMIT');
        return { ok: true, plan };
      } catch (error) {
        try {
          db.exec('ROLLBACK');
        } catch {
          // No open transaction (the failure was the COMMIT itself, which already rolled back).
        }
        throw error;
      }
    },

    remove: (segmentId) => Number(deleteStatement.run(segmentId).changes) > 0,

    removeAll: () => Number(deleteAllStatement.run().changes),

    close: () => db.close(),
  };
}

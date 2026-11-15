import type {
  Coordinate,
  SegmentEffortRecord,
  SegmentImportProblem,
  SegmentRecord,
} from '../../src/types/segment';
import {
  effortKey,
  isIsoDateTime,
  SEGMENT_FIELDS,
} from '../../src/features/segments/services/segmentRules';
import {
  checkEffort,
  checkSegment,
} from '../../src/features/segments/services/validateSegmentPayload';

/*
 * The JSON segment catalog file (ADR-0011, docs/segment-catalog-format.md). Pure: converts between
 * the file's JSON and the in-memory catalog, and validates the file, which a user may have edited
 * by hand, with the same rules as an import.
 */

export const CATALOG_FORMAT = 'segment-catalog';
export const CATALOG_VERSION = 1;

/** One stored segment: its record, where and when it was imported, and its efforts. */
export interface CatalogEntry {
  readonly record: SegmentRecord;
  readonly sourceFile: string | null;
  readonly importedAt: string;
  readonly updatedAt: string;
  /** Unique by effort key (RULE-16). */
  readonly efforts: readonly SegmentEffortRecord[];
}

/** Stored segments by Strava segment ID: one entry per ID (RULE-14). */
export type Catalog = ReadonlyMap<string, CatalogEntry>;

export type CatalogReadResult =
  | { readonly ok: true; readonly catalog: Catalog }
  | { readonly ok: false; readonly problems: readonly SegmentImportProblem[] };

type Obj = Record<string, unknown>;
const isObject = (value: unknown): value is Obj =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const pair = (c: Coordinate): [number, number] => [c.latitude, c.longitude];
/** `[lat, lng]` → coordinate; anything else is passed on for the validator to reject. */
const coordinate = (value: unknown): unknown =>
  Array.isArray(value) && value.length === 2
    ? { latitude: value[0] as unknown, longitude: value[1] as unknown }
    : value;

/** Segment IDs in numeric order: digit strings compare by length, then lexically. */
const byId = (a: string, b: string) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0);

/** The catalog as file JSON: one segment per line, in segment ID order, efforts by date. */
export function serializeCatalog(catalog: Catalog): string {
  const lines = [...catalog.keys()].sort(byId).map((id) => {
    // `byId` sorted the map's own keys, so the entry exists.
    const entry = catalog.get(id) as CatalogEntry;
    const { record } = entry;
    const fields: Obj = { segmentId: record.segmentId };
    for (const field of SEGMENT_FIELDS) fields[field] = record[field];
    fields.start = record.start && pair(record.start);
    fields.end = record.end && pair(record.end);
    fields.route = record.route && record.route.map(pair);
    fields.sourceFile = entry.sourceFile;
    fields.importedAt = entry.importedAt;
    fields.updatedAt = entry.updatedAt;
    fields.efforts = [...entry.efforts]
      .sort((a, b) => (a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0))
      .map(({ effortId, activityId, startDate, elapsedTimeS, movingTimeS }) => ({
        effortId,
        activityId,
        startDate,
        elapsedTimeS,
        movingTimeS,
      }));
    return `    ${JSON.stringify(fields)}`;
  });
  const head = `{\n  "format": ${JSON.stringify(CATALOG_FORMAT)},\n  "version": ${CATALOG_VERSION},\n  "segments": [`;
  return lines.length === 0 ? `${head}]\n}\n` : `${head}\n${lines.join(',\n')}\n  ]\n}\n`;
}

/**
 * Reads and validates catalog file JSON (BR-23, BR-29). Every problem is reported; a catalog with
 * any problem is not loaded at all, so a damaged file is never overwritten with partial data.
 */
// Implements: BR-23, BR-29, RULE-14
export function readCatalog(json: unknown): CatalogReadResult {
  const problems: SegmentImportProblem[] = [];
  const fail = (message: string): CatalogReadResult => ({
    ok: false,
    problems: [{ location: 'catalog', field: null, message }],
  });
  if (!isObject(json) || json.format !== CATALOG_FORMAT) {
    return fail(`Not a segment catalog (expected "format": "${CATALOG_FORMAT}").`);
  }
  if (typeof json.version !== 'number' || !Number.isInteger(json.version) || json.version < 1) {
    return fail('Has no valid "version".');
  }
  if (json.version > CATALOG_VERSION) {
    return fail(
      `Catalog version ${json.version} is newer than this application (${CATALOG_VERSION}).`,
    );
  }
  if (!Array.isArray(json.segments)) {
    return fail('Must contain a "segments" list.');
  }

  const catalog = new Map<string, CatalogEntry>();
  json.segments.forEach((raw: unknown, index) => {
    let location = `segment ${index + 1}`;
    const report = (field: string | null, message: string) =>
      problems.push({ location, field, message });
    if (!isObject(raw)) {
      report(null, 'Must be an object.');
      return;
    }
    if (typeof raw.segmentId === 'string') location += ` (ID ${raw.segmentId})`;
    let valid = true;
    const reportInvalid = (field: string | null, message: string) => {
      valid = false;
      report(field, message);
    };

    const record = checkSegment(
      {
        ...raw,
        start: coordinate(raw.start),
        end: coordinate(raw.end),
        route: Array.isArray(raw.route) ? raw.route.map(coordinate) : raw.route,
      },
      reportInvalid,
    );
    const sourceFile = raw.sourceFile ?? null;
    if (sourceFile !== null && (typeof sourceFile !== 'string' || sourceFile.length > 255)) {
      reportInvalid('sourceFile', 'Must be a file name of up to 255 characters, or null.');
    }
    for (const field of ['importedAt', 'updatedAt'] as const) {
      const value = raw[field];
      if (typeof value !== 'string' || !isIsoDateTime(value)) {
        reportInvalid(field, 'Must be an ISO 8601 date-time with a time zone.');
      }
    }
    const efforts: SegmentEffortRecord[] = [];
    const effortKeys = new Set<string>();
    if (!Array.isArray(raw.efforts)) {
      reportInvalid('efforts', 'Must be a list.');
    } else {
      raw.efforts.forEach((rawEffort: unknown, effortIndex) => {
        const effortLocation = `${location}, effort ${effortIndex + 1}`;
        const effort = checkEffort(
          isObject(rawEffort) ? { ...rawEffort, segmentId: raw.segmentId } : rawEffort,
          (field, message) => {
            valid = false;
            problems.push({ location: effortLocation, field, message });
          },
        );
        if (!effort) return;
        const key = effortKey(effort);
        if (effortKeys.has(key)) {
          valid = false;
          problems.push({
            location: effortLocation,
            field: 'effortId',
            message: 'Appears more than once.',
          });
          return;
        }
        effortKeys.add(key);
        efforts.push(effort);
      });
    }
    if (!record || !valid) return;
    if (catalog.has(record.segmentId)) {
      report('segmentId', 'Appears more than once.');
      return;
    }
    catalog.set(record.segmentId, {
      record,
      sourceFile: sourceFile as string | null,
      importedAt: new Date(raw.importedAt as string).toISOString(),
      updatedAt: new Date(raw.updatedAt as string).toISOString(),
      efforts,
    });
  });

  return problems.length > 0 ? { ok: false, problems } : { ok: true, catalog };
}

import type { Coordinate, SegmentEffortRecord, SegmentRecord } from '../../src/types/segment';
import { effortKey, isIsoDateTime } from '../../src/features/segments/services/segmentRules';
import {
  checkEffort,
  checkSegment,
} from '../../src/features/segments/services/validateSegmentPayload';

/*
 * The JSON segment catalog file (ADR-0011, docs/segment-catalog-format.md). Pure: converts between
 * the file's JSON and the in-memory catalog. The file may have been written or edited by hand, so
 * reading is forgiving: an unusable field is ignored, an unusable entry is skipped, and each is
 * reported as a warning. Only a file that is not a catalog at all is refused.
 */

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
  | { readonly ok: true; readonly catalog: Catalog; readonly warnings: readonly string[] }
  | { readonly ok: false; readonly error: string };

type Obj = Record<string, unknown>;
const isObject = (value: unknown): value is Obj =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Distances are kept to the millimetre, so metres ↔ `distanceKm` round-trips exactly. */
const roundMm = (m: number) => Math.round(m * 1000) / 1000;
const metresToKm = (m: number) => Math.round(m * 1000) / 1e6;
const kmToMetres = (km: number) => Math.round(km * 1e6) / 1000;

/** The record as the catalog stores it: distance to the millimetre. */
export function normalizeRecord(record: SegmentRecord): SegmentRecord {
  return record.distanceM === null ? record : { ...record, distanceM: roundMm(record.distanceM) };
}

/** Normalized field → the catalog's own field name, for warnings. */
const FILE_FIELDS: Readonly<Record<string, string>> = {
  segmentId: 'id',
  distanceM: 'distanceKm',
  elevationLowM: 'elevationMinM',
  elevationHighM: 'elevationMaxM',
  route: 'route.latlng',
  altitudeSamplesM: 'route.altitude',
  distanceSamplesM: 'route.distance',
};

/** Extra fields kept after the documented ones, so no imported detail is lost (BR-23, BR-25). */
const EXTRA_FIELDS = [
  'elevationGainM',
  'averageGradePct',
  'maximumGradePct',
  'city',
  'state',
  'country',
  'prElapsedTimeS',
  'prDate',
  'effortCount',
] as const satisfies readonly (keyof SegmentRecord)[];

const latLng = (c: Coordinate | null) => c && { lat: c.latitude, lng: c.longitude };

/** Segment IDs in numeric order: digit strings compare by length, then lexically. */
const byId = (a: string, b: string) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0);

/** The catalog as file JSON: one segment per line, in segment ID order, efforts by date. */
export function serializeCatalog(catalog: Catalog): string {
  const lines = [...catalog.keys()].sort(byId).map((id) => {
    // `byId` sorted the map's own keys, so the entry exists.
    const entry = catalog.get(id) as CatalogEntry;
    const { record } = entry;
    const fields: Obj = {
      id: record.segmentId,
      name: record.name,
      distanceKm: record.distanceM === null ? null : metresToKm(record.distanceM),
      elevationMinM: record.elevationLowM,
      elevationMaxM: record.elevationHighM,
      start: latLng(record.start),
      end: latLng(record.end),
      route: record.route && {
        latlng: record.route.map((c) => [c.latitude, c.longitude]),
        altitude: record.altitudeSamplesM,
        distance: record.distanceSamplesM,
      },
    };
    for (const field of EXTRA_FIELDS) fields[field] = record[field];
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
  const head = `{\n  "version": ${CATALOG_VERSION},\n  "segments": [`;
  return lines.length === 0 ? `${head}]\n}\n` : `${head}\n${lines.join(',\n')}\n  ]\n}\n`;
}

/** `{ lat, lng }` → coordinate; anything else is passed on for the validator to reject. */
const coordinate = (value: unknown): unknown =>
  isObject(value) ? { latitude: value.lat, longitude: value.lng } : (value ?? null);

const segmentIdOf = (value: unknown): string | null => {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return String(value);
  if (typeof value === 'string' && /^[1-9]\d{0,19}$/.test(value.trim())) return value.trim();
  return null;
};

/**
 * Reads catalog file JSON (BR-23, BR-29, RULE-14). Refuses only what is not a catalog (not an
 * object, a `segments` value that is not a list, a newer version). Otherwise loads every usable
 * segment: an invalid field becomes unknown, an entry without a valid or unique ID and an invalid
 * effort are skipped, each with a warning. Missing optional fields are simply unknown.
 * `now` dates entries that have no import dates.
 */
// Implements: BR-23, BR-29, RULE-14
export function readCatalog(json: unknown, now: Date = new Date()): CatalogReadResult {
  if (!isObject(json)) {
    return { ok: false, error: 'Not a segment catalog: expected an object with "segments".' };
  }
  const warnings: string[] = [];
  const { version } = json;
  if (version === undefined) {
    warnings.push(`No "version"; read as version ${CATALOG_VERSION}.`);
  } else if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return { ok: false, error: 'Not a segment catalog: "version" must be a whole number.' };
  } else if (version > CATALOG_VERSION) {
    return {
      ok: false,
      error: `Catalog version ${version} is newer than this application (${CATALOG_VERSION}).`,
    };
  }
  const segments = json.segments ?? [];
  if (!Array.isArray(segments)) {
    return { ok: false, error: 'Not a segment catalog: "segments" must be a list.' };
  }

  const timestamp = now.toISOString();
  const catalog = new Map<string, CatalogEntry>();
  segments.forEach((raw: unknown, index) => {
    const id = isObject(raw) ? segmentIdOf(raw.id) : null;
    const where = `segment ${index + 1}${id ? ` (ID ${id})` : ''}`;
    const warn = (message: string) => warnings.push(`${where}: ${message}`);
    if (!isObject(raw) || id === null) {
      warn('skipped: it has no valid "id" (the Strava segment ID).');
      return;
    }
    if (catalog.has(id)) {
      warn('skipped: the ID appears more than once; the first entry is kept.');
      return;
    }
    const record = readRecord(raw, id, warn);
    const text = (field: 'sourceFile') => {
      const value = raw[field];
      if (value === null || value === undefined) return null;
      if (typeof value === 'string' && value.length <= 255) return value;
      warn(`"${field}" ignored: must be a file name of up to 255 characters.`);
      return null;
    };
    const date = (field: 'importedAt' | 'updatedAt') => {
      const value = raw[field];
      if (typeof value === 'string' && isIsoDateTime(value)) return new Date(value).toISOString();
      if (value !== undefined && value !== null) {
        warn(`"${field}" ignored: must be an ISO 8601 date-time.`);
      }
      return timestamp;
    };
    catalog.set(id, {
      record,
      sourceFile: text('sourceFile'),
      importedAt: date('importedAt'),
      updatedAt: date('updatedAt'),
      efforts: readEfforts(raw.efforts, id, warn),
    });
  });
  return { ok: true, catalog, warnings };
}

/**
 * The segment record of one entry. Each invalid field is set to unknown and validation repeats,
 * because fields depend on each other (samples need a valid route).
 */
function readRecord(raw: Obj, id: string, warn: (message: string) => void): SegmentRecord {
  const route = isObject(raw.route) ? raw.route : {};
  const latlng = route.latlng;
  const candidate: Obj = {
    segmentId: id,
    name: typeof raw.name === 'string' && raw.name.trim() !== '' ? raw.name : `Segment ${id}`,
    distanceM: typeof raw.distanceKm === 'number' ? kmToMetres(raw.distanceKm) : raw.distanceKm,
    elevationLowM: raw.elevationMinM,
    elevationHighM: raw.elevationMaxM,
    start: coordinate(raw.start),
    end: coordinate(raw.end),
    route: Array.isArray(latlng)
      ? latlng.map((pair: unknown) =>
          Array.isArray(pair) && pair.length >= 2
            ? { latitude: pair[0] as unknown, longitude: pair[1] as unknown }
            : pair,
        )
      : (latlng ?? null),
    altitudeSamplesM: route.altitude ?? null,
    distanceSamplesM: route.distance ?? null,
  };
  if (raw.route !== undefined && raw.route !== null && !isObject(raw.route)) {
    warn('"route" ignored: must be an object with "latlng", "altitude" and "distance".');
  }
  for (const field of EXTRA_FIELDS) candidate[field] = raw[field] ?? null;

  // Each round replaces every reported field with a value that is always valid (unknown, or the
  // default name), so few rounds are ever needed; the bound only guards against a logic error.
  for (let round = 0; round < 32; round += 1) {
    const problems: { field: string; message: string }[] = [];
    const record = checkSegment(candidate, (field, message) => problems.push({ field, message }));
    if (record) return normalizeRecord(record);
    for (const { field, message } of problems) {
      warn(`"${FILE_FIELDS[field] ?? field}" ignored: ${message}`);
      candidate[field] = field === 'name' ? `Segment ${id}` : null;
    }
  }
  throw new Error(`Segment ${id} could not be read from the catalog.`);
}

function readEfforts(
  value: unknown,
  segmentId: string,
  warn: (message: string) => void,
): SegmentEffortRecord[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    warn('"efforts" ignored: must be a list.');
    return [];
  }
  const efforts: SegmentEffortRecord[] = [];
  const keys = new Set<string>();
  value.forEach((raw: unknown, index) => {
    const problems: string[] = [];
    const effort = checkEffort(isObject(raw) ? { ...raw, segmentId } : raw, (field, message) =>
      problems.push(`${field}: ${message}`),
    );
    if (!effort) {
      warn(`effort ${index + 1} skipped (${problems.join(' ')})`);
      return;
    }
    const key = effortKey(effort);
    if (keys.has(key)) {
      warn(`effort ${index + 1} skipped: it appears more than once.`);
      return;
    }
    keys.add(key);
    efforts.push(effort);
  });
  return efforts;
}

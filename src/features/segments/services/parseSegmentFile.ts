import { parseCsv } from '@/services/strava-export/csv';
import type { Coordinate, SegmentImportPayload, SegmentImportProblem } from '@/types';
import { decodePolyline } from '@/utils/polyline';
import { LIMITS } from './segmentRules';
import { validateSegmentPayload } from './validateSegmentPayload';

/*
 * Browser-only: reads a segment file into a normalized payload (ADR-0010,
 * docs/segment-import-format.md). The backend never runs this; it re-validates the payload.
 */

export type SegmentFileResult =
  | { readonly ok: true; readonly payload: SegmentImportPayload }
  | { readonly ok: false; readonly problems: readonly SegmentImportProblem[] };

type Obj = Record<string, unknown>;
const isObject = (value: unknown): value is Obj =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Normalized field name → the file's own field name, per format, for messages (AC-21). */
const JSON_FIELDS: Readonly<Record<string, string>> = {
  segmentId: 'id',
  distanceM: 'distance',
  elevationGainM: 'total_elevation_gain',
  averageGradePct: 'average_grade',
  maximumGradePct: 'maximum_grade',
  elevationHighM: 'elevation_high',
  elevationLowM: 'elevation_low',
  start: 'start_latlng',
  end: 'end_latlng',
  route: 'streams.latlng / geometry / map.polyline',
  altitudeSamplesM: 'streams.altitude / geometry altitude',
  distanceSamplesM: 'streams.distance',
  prElapsedTimeS: 'athlete_segment_stats.pr_elapsed_time',
  prDate: 'athlete_segment_stats.pr_date',
  effortCount: 'athlete_segment_stats.effort_count',
  startDate: 'start_date',
  elapsedTimeS: 'elapsed_time',
  movingTimeS: 'moving_time',
  effortId: 'id',
  activityId: 'activity_id',
};
const CSV_FIELDS: Readonly<Record<string, string>> = {
  segmentId: 'segment_id',
  distanceM: 'distance_m',
  elevationGainM: 'elevation_gain_m',
  averageGradePct: 'average_grade',
  maximumGradePct: 'maximum_grade',
  elevationHighM: 'elevation_high_m',
  elevationLowM: 'elevation_low_m',
  start: 'start_lat / start_lng',
  end: 'end_lat / end_lng',
  route: 'polyline',
  prElapsedTimeS: 'pr_elapsed_time_s',
  prDate: 'pr_date',
  effortCount: 'effort_count',
  startDate: 'start_date',
  elapsedTimeS: 'elapsed_time_s',
  movingTimeS: 'moving_time_s',
  effortId: 'effort_id',
  activityId: 'activity_id',
};

const INVALID = Symbol('invalid'); // a value present in the file but unusable

/**
 * Reads a JSON, GeoJSON or CSV segment file and validates it (BR-20, BR-21, AC-20, AC-21).
 * Returns the normalized payload, or every problem found, located by record and field.
 * `knownSegmentIds` are the stored segments that efforts may reference (efforts CSV).
 */
// Implements: BR-20, BR-21, AC-20, AC-21
export function parseSegmentFile(
  fileName: string,
  text: string,
  knownSegmentIds: ReadonlySet<string> = new Set(),
): SegmentFileResult {
  const fail = (message: string): SegmentFileResult => ({
    ok: false,
    problems: [{ location: 'file', field: null, message }],
  });
  const extension = /\.([a-z]+)$/i.exec(fileName.trim())?.[1]?.toLowerCase();
  if (extension !== 'json' && extension !== 'geojson' && extension !== 'csv') {
    return fail('Unsupported file type. Choose a .json, .geojson or .csv file.');
  }
  if (text.trim() === '') {
    return fail('The file is empty.');
  }

  let draft: Draft;
  if (extension === 'csv') {
    const csv = readCsv(text);
    if ('error' in csv) return fail(csv.error);
    draft = csv;
  } else {
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return fail('The file is not valid JSON.');
    }
    const result =
      isObject(json) && json.type === 'FeatureCollection' ? readGeoJson(json) : readJson(json);
    if ('error' in result) return fail(result.error);
    draft = result;
  }

  const validation = validateSegmentPayload(
    {
      sourceFile: fileName.slice(0, 255),
      segments: draft.segments,
      efforts: draft.efforts,
    },
    knownSegmentIds,
  );
  if (validation.ok) {
    return validation;
  }
  const names = extension === 'csv' ? CSV_FIELDS : JSON_FIELDS;
  return {
    ok: false,
    problems: validation.problems.map((problem) => ({
      location: relocate(problem.location, draft),
      field: problem.field === null ? null : (names[problem.field] ?? problem.field),
      message: problem.message,
    })),
  };
}

interface Draft {
  readonly segments: Obj[];
  readonly efforts: Obj[];
  /** Human location of each segment / effort, by index. */
  readonly segmentLocations: string[];
  readonly effortLocations: string[];
}

/** "segment 3" from the validator → the file's own location, e.g. "row 4" or "segment 3 (ID 7)". */
function relocate(location: string, draft: Draft): string {
  const match = /^(segment|effort) (\d+)/.exec(location);
  if (!match) return location;
  const index = Number(match[2]) - 1;
  const mapped = (match[1] === 'segment' ? draft.segmentLocations : draft.effortLocations)[index];
  return mapped ?? location;
}

// ---------------------------------------------------------------------------------------------
// Value conversion: keep a value the validator can judge. Unusable input becomes a sentinel the
// validator rejects with the right field ("Must be a number", …).

const text = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s === '' ? null : s;
};

const number = (value: unknown): unknown => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  const s = String(value).trim();
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : s;
};

const id = (value: unknown): unknown => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number')
    return Number.isSafeInteger(value) ? String(value) : String(INVALID);
  return String(value).trim();
};

/** Date part of a `YYYY-MM-DD` or ISO date-time. */
const date = (value: unknown): unknown => {
  const s = text(value);
  if (s === null) return null;
  return /^\d{4}-\d{2}-\d{2}T/.test(s) ? s.slice(0, 10) : s;
};

/** `[lat, lng]` → coordinate; anything else is invalid. */
const latLngPair = (value: unknown): unknown => {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value) && value.length === 0) return null; // Strava uses [] for unknown
  if (Array.isArray(value) && value.length === 2) {
    const [latitude, longitude] = value.map(number);
    if (typeof latitude === 'number' && typeof longitude === 'number')
      return { latitude, longitude };
  }
  return INVALID;
};

interface Line {
  readonly route: unknown;
  readonly altitude: unknown;
}
const INVALID_LINE: Line = { route: INVALID, altitude: null };

/**
 * GeoJSON LineString / MultiLineString → route; MultiLineString parts are joined in order. When
 * every position has a third value, those are the altitude samples (BR-29).
 */
function geoJsonLine(geometry: unknown): Line {
  if (geometry === null || geometry === undefined) return { route: null, altitude: null };
  if (!isObject(geometry) || !Array.isArray(geometry.coordinates)) return INVALID_LINE;
  const lines =
    geometry.type === 'LineString'
      ? [geometry.coordinates]
      : geometry.type === 'MultiLineString'
        ? geometry.coordinates
        : null;
  if (!lines) return INVALID_LINE;
  const route: Coordinate[] = [];
  const altitude: unknown[] = [];
  for (const line of lines) {
    if (!Array.isArray(line)) return INVALID_LINE;
    for (const position of line) {
      if (
        !Array.isArray(position) ||
        typeof position[0] !== 'number' ||
        typeof position[1] !== 'number'
      ) {
        return INVALID_LINE;
      }
      route.push({ latitude: position[1], longitude: position[0] });
      altitude.push(position[2]);
    }
    if (route.length > LIMITS.routePoints) return INVALID_LINE;
  }
  const hasAltitude = altitude.length > 0 && altitude.every((value) => value !== undefined);
  return { route, altitude: hasAltitude ? altitude : null };
}

/**
 * Strava segment streams (BR-29), keyed by type (`{ latlng: { data } }`) or as a list
 * (`[{ type: 'latlng', data }]`). Returns the `data` of each stream type present.
 */
function readStreams(value: unknown): Readonly<Record<string, unknown>> {
  const streams: Record<string, unknown> = {};
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (isObject(entry) && typeof entry.type === 'string') streams[entry.type] = entry.data;
    }
  } else if (isObject(value)) {
    for (const [type, entry] of Object.entries(value)) {
      streams[type] = isObject(entry) ? entry.data : entry;
    }
  }
  return streams;
}

/** `latlng` stream data (`[[lat, lng], …]`) → route. */
const latLngRoute = (data: unknown): unknown => {
  if (data === null || data === undefined) return null;
  if (!Array.isArray(data) || data.length > LIMITS.routePoints) return INVALID;
  return data.map((pair) => {
    const point = latLngPair(pair);
    return point === null ? INVALID : point;
  });
};

const samples = (data: unknown): unknown => (data === undefined ? null : data);

const polylineRoute = (value: unknown): unknown => {
  const encoded = text(value);
  if (encoded === null) return null;
  return decodePolyline(encoded) ?? INVALID;
};

// ---------------------------------------------------------------------------------------------
// JSON and GeoJSON (Strava field names)

function segmentFromStrava(raw: Obj, geometry: unknown): Obj {
  const stats = isObject(raw.athlete_segment_stats) ? raw.athlete_segment_stats : {};
  const map = isObject(raw.map) ? raw.map : {};
  const streams = readStreams(raw.streams);
  // The full-resolution latlng stream is the route the other streams are aligned with.
  const line: Line =
    streams.latlng !== undefined
      ? { route: latLngRoute(streams.latlng), altitude: null }
      : geometry !== undefined && geometry !== null
        ? geoJsonLine(geometry)
        : raw.geometry !== undefined
          ? geoJsonLine(raw.geometry)
          : { route: polylineRoute(map.polyline ?? map.summary_polyline), altitude: null };
  const route = line.route;
  return {
    segmentId: id(raw.id ?? raw.segment_id),
    name: text(raw.name) ?? '',
    distanceM: number(raw.distance),
    elevationGainM: number(raw.total_elevation_gain),
    averageGradePct: number(raw.average_grade),
    maximumGradePct: number(raw.maximum_grade),
    elevationHighM: number(raw.elevation_high),
    elevationLowM: number(raw.elevation_low),
    city: text(raw.city),
    state: text(raw.state),
    country: text(raw.country),
    start: latLngPair(raw.start_latlng),
    end: latLngPair(raw.end_latlng),
    route,
    altitudeSamplesM: streams.altitude !== undefined ? samples(streams.altitude) : line.altitude,
    distanceSamplesM: samples(streams.distance),
    prElapsedTimeS: number(stats.pr_elapsed_time),
    prDate: date(stats.pr_date),
    effortCount: number(stats.effort_count),
  };
}

function effortFromStrava(raw: unknown, segmentId: unknown): Obj {
  const effort = isObject(raw) ? raw : {};
  const activity = isObject(effort.activity) ? effort.activity : {};
  return {
    segmentId,
    effortId: id(effort.id),
    activityId: id(effort.activity_id ?? activity.id),
    startDate: text(effort.start_date),
    elapsedTimeS: number(effort.elapsed_time),
    movingTimeS: number(effort.moving_time),
  };
}

function collect(
  entries: { raw: unknown; geometry?: unknown; featureId?: unknown }[],
  label: string,
) {
  const draft: Draft = { segments: [], efforts: [], segmentLocations: [], effortLocations: [] };
  entries.forEach(({ raw, geometry, featureId }, index) => {
    const source = isObject(raw) ? raw : {};
    const withId =
      source.id === undefined && featureId !== undefined ? { ...source, id: featureId } : source;
    const segment = segmentFromStrava(withId, geometry);
    const where = `${label} ${index + 1}${typeof segment.segmentId === 'string' ? ` (ID ${segment.segmentId})` : ''}`;
    draft.segments.push(isObject(raw) ? segment : (raw as Obj));
    draft.segmentLocations.push(where);
    const efforts = Array.isArray(source.efforts) ? source.efforts : [];
    efforts.forEach((effort: unknown, effortIndex) => {
      draft.efforts.push(effortFromStrava(effort, segment.segmentId));
      draft.effortLocations.push(`${where}, effort ${effortIndex + 1}`);
    });
  });
  return draft;
}

function readJson(json: unknown): Draft | { error: string } {
  const list = Array.isArray(json) ? json : isObject(json) ? json.segments : undefined;
  if (!Array.isArray(list)) {
    return { error: 'Expected a list of segments, or an object with a "segments" list.' };
  }
  return collect(
    list.map((raw) => ({ raw })),
    'segment',
  );
}

function readGeoJson(json: Obj): Draft | { error: string } {
  if (!Array.isArray(json.features)) {
    return { error: 'The GeoJSON FeatureCollection has no "features" list.' };
  }
  return collect(
    json.features.map((feature: unknown) => {
      const f = isObject(feature) ? feature : {};
      return {
        raw: isObject(f.properties) ? f.properties : {},
        geometry: f.geometry ?? null,
        featureId: f.id,
      };
    }),
    'feature',
  );
}

// ---------------------------------------------------------------------------------------------
// CSV

function readCsv(content: string): Draft | { error: string } {
  const [header, ...records] = parseCsv(content);
  if (!header) return { error: 'The CSV file has no header row.' };
  const names = header.map((name) => name.trim().toLowerCase());
  const has = (name: string) => names.includes(name);
  const rows = records
    .map((record, index) => ({ record, row: index + 2 }))
    .filter(({ record }) => record.some((value) => value.trim() !== ''));
  const cell = (record: readonly string[], name: string) => {
    const index = names.indexOf(name);
    return index < 0 ? null : (record[index] ?? null);
  };

  const draft: Draft = { segments: [], efforts: [], segmentLocations: [], effortLocations: [] };
  if (has('segment_id') && has('name')) {
    for (const { record, row } of rows) {
      const c = (name: string) => cell(record, name);
      const pair = (lat: string, lng: string) => {
        const latitude = number(c(lat));
        const longitude = number(c(lng));
        if (latitude === null && longitude === null) return null;
        return typeof latitude === 'number' && typeof longitude === 'number'
          ? { latitude, longitude }
          : INVALID;
      };
      draft.segments.push({
        segmentId: id(c('segment_id')),
        name: text(c('name')) ?? '',
        distanceM: number(c('distance_m')),
        elevationGainM: number(c('elevation_gain_m')),
        averageGradePct: number(c('average_grade')),
        maximumGradePct: number(c('maximum_grade')),
        elevationHighM: number(c('elevation_high_m')),
        elevationLowM: number(c('elevation_low_m')),
        city: text(c('city')),
        state: text(c('state')),
        country: text(c('country')),
        start: pair('start_lat', 'start_lng'),
        end: pair('end_lat', 'end_lng'),
        route: polylineRoute(c('polyline')),
        altitudeSamplesM: null,
        distanceSamplesM: null,
        prElapsedTimeS: number(c('pr_elapsed_time_s')),
        prDate: date(c('pr_date')),
        effortCount: number(c('effort_count')),
      });
      draft.segmentLocations.push(`row ${row}`);
    }
    return draft;
  }
  if (has('segment_id') && has('elapsed_time_s') && has('start_date')) {
    for (const { record, row } of rows) {
      const c = (name: string) => cell(record, name);
      draft.efforts.push({
        segmentId: id(c('segment_id')),
        effortId: id(c('effort_id')),
        activityId: id(c('activity_id')),
        startDate: text(c('start_date')),
        elapsedTimeS: number(c('elapsed_time_s')),
        movingTimeS: number(c('moving_time_s')),
      });
      draft.effortLocations.push(`row ${row}`);
    }
    return draft;
  }
  return {
    error:
      'Unrecognised CSV header. A segments CSV needs "segment_id" and "name" columns; an efforts CSV needs "segment_id", "start_date" and "elapsed_time_s".',
  };
}

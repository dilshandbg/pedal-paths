import type {
  Coordinate,
  SegmentEffortRecord,
  SegmentImportPayload,
  SegmentImportProblem,
  SegmentRecord,
} from '@/types';
import {
  ID_PATTERN,
  LIMITS,
  isCalendarDate,
  isIsoDateTime,
  isValidCoordinate,
} from './segmentRules';

export type PayloadValidation =
  | { readonly ok: true; readonly payload: SegmentImportPayload }
  | { readonly ok: false; readonly problems: readonly SegmentImportProblem[] };

type Obj = Record<string, unknown>;
const isObject = (value: unknown): value is Obj =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Validates a normalized import payload as received over the wire (BR-21, NFR-08). The browser
 * sends it after parsing a file, and the backend runs this again before previewing or storing:
 * nothing is trusted. Efforts must reference a segment in the payload or in `knownSegmentIds`.
 * Problems use the normalized field names.
 */
// Implements: BR-21, NFR-08
export function validateSegmentPayload(
  input: unknown,
  knownSegmentIds: ReadonlySet<string> = new Set(),
): PayloadValidation {
  const problems: SegmentImportProblem[] = [];
  const problem = (location: string, field: string | null, message: string) => {
    problems.push({ location, field, message });
  };

  if (!isObject(input)) {
    return {
      ok: false,
      problems: [{ location: 'file', field: null, message: 'Expected an object.' }],
    };
  }
  const { sourceFile, segments, efforts } = input;
  if (typeof sourceFile !== 'string' || sourceFile.length > 255) {
    problem('file', 'sourceFile', 'Must be a file name of up to 255 characters.');
  }
  if (!Array.isArray(segments) || !Array.isArray(efforts)) {
    problem('file', null, 'Must contain "segments" and "efforts" lists.');
    return { ok: false, problems };
  }
  if (segments.length + efforts.length === 0) {
    problem('file', null, 'Contains no segments or efforts.');
  }
  if (segments.length > LIMITS.segmentsPerImport) {
    problem('file', null, `Contains more than ${LIMITS.segmentsPerImport} segments.`);
  }
  if (efforts.length > LIMITS.effortsPerImport) {
    problem('file', null, `Contains more than ${LIMITS.effortsPerImport} efforts.`);
  }
  if (problems.length > 0) {
    return { ok: false, problems };
  }

  const validSegments: SegmentRecord[] = [];
  const seen = new Set<string>();
  segments.forEach((raw: unknown, index) => {
    const location = `segment ${index + 1}`;
    const record = checkSegment(raw, (field, message) => problem(location, field, message));
    if (!record) return;
    if (seen.has(record.segmentId)) {
      problem(`${location} (ID ${record.segmentId})`, 'segmentId', 'Appears more than once.');
      return;
    }
    seen.add(record.segmentId);
    validSegments.push(record);
  });

  const validEfforts: SegmentEffortRecord[] = [];
  efforts.forEach((raw: unknown, index) => {
    const location = `effort ${index + 1}`;
    const effort = checkEffort(raw, (field, message) => problem(location, field, message));
    if (!effort) return;
    if (!seen.has(effort.segmentId) && !knownSegmentIds.has(effort.segmentId)) {
      problem(
        location,
        'segmentId',
        `Segment ${effort.segmentId} is not in this import or stored.`,
      );
      return;
    }
    validEfforts.push(effort);
  });

  if (problems.length > 0) {
    return { ok: false, problems };
  }
  return {
    ok: true,
    payload: { sourceFile: sourceFile as string, segments: validSegments, efforts: validEfforts },
  };
}

type Report = (field: string, message: string) => void;

function nullableNumber(
  obj: Obj,
  field: string,
  report: Report,
  { min = -Infinity, max = Infinity, integer = false } = {},
): number | null {
  const value = obj[field];
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    report(field, 'Must be a number.');
    return null;
  }
  if (integer && !Number.isInteger(value)) {
    report(field, 'Must be a whole number.');
    return null;
  }
  if (value < min || value > max) {
    report(field, `Must be between ${min} and ${max}.`);
    return null;
  }
  return value;
}

function nullableText(obj: Obj, field: string, report: Report, max: number): string | null {
  const value = obj[field];
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || value.length > max) {
    report(field, `Must be text of up to ${max} characters.`);
    return null;
  }
  return value.trim() === '' ? null : value.trim();
}

function nullableCoordinate(obj: Obj, field: string, report: Report): Coordinate | null {
  const value = obj[field];
  if (value === null || value === undefined) return null;
  const coordinate = toCoordinate(value);
  if (!coordinate) report(field, 'Must be a valid latitude/longitude.');
  return coordinate;
}

function toCoordinate(value: unknown): Coordinate | null {
  if (!isObject(value)) return null;
  const { latitude, longitude } = value;
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return null;
  const coordinate = { latitude, longitude };
  return isValidCoordinate(coordinate) ? coordinate : null;
}

function checkSegment(raw: unknown, report: Report): SegmentRecord | null {
  if (!isObject(raw)) {
    report('segment', 'Must be an object.');
    return null;
  }
  let valid = true;
  const fail: Report = (field, message) => {
    valid = false;
    report(field, message);
  };

  const segmentId = raw.segmentId;
  if (typeof segmentId !== 'string' || !ID_PATTERN.test(segmentId)) {
    fail('segmentId', 'Must be a positive whole number (the Strava segment ID).');
  }
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  if (name === '' || name.length > LIMITS.nameLength) {
    fail('name', `Is required, up to ${LIMITS.nameLength} characters.`);
  }

  let route: Coordinate[] | null = null;
  if (raw.route !== null && raw.route !== undefined) {
    if (
      !Array.isArray(raw.route) ||
      raw.route.length < 2 ||
      raw.route.length > LIMITS.routePoints
    ) {
      fail('route', `Must be a line of 2 to ${LIMITS.routePoints} valid points.`);
    } else {
      const points = raw.route.map(toCoordinate);
      if (points.some((point) => point === null)) {
        fail('route', 'Contains an invalid latitude/longitude.');
      } else {
        route = points as Coordinate[];
      }
    }
  }

  const prDate = nullableText(raw, 'prDate', fail, 10);
  if (prDate !== null && !isCalendarDate(prDate)) {
    fail('prDate', 'Must be a date as YYYY-MM-DD.');
  }

  const record: SegmentRecord = {
    segmentId: segmentId as string,
    name,
    distanceM: nullableNumber(raw, 'distanceM', fail, { min: 0, max: 1_000_000 }),
    elevationGainM: nullableNumber(raw, 'elevationGainM', fail, { min: 0, max: 20_000 }),
    averageGradePct: nullableNumber(raw, 'averageGradePct', fail, { min: -100, max: 100 }),
    maximumGradePct: nullableNumber(raw, 'maximumGradePct', fail, { min: -100, max: 100 }),
    elevationHighM: nullableNumber(raw, 'elevationHighM', fail, { min: -500, max: 9000 }),
    elevationLowM: nullableNumber(raw, 'elevationLowM', fail, { min: -500, max: 9000 }),
    city: nullableText(raw, 'city', fail, LIMITS.textLength),
    state: nullableText(raw, 'state', fail, LIMITS.textLength),
    country: nullableText(raw, 'country', fail, LIMITS.textLength),
    start: nullableCoordinate(raw, 'start', fail),
    end: nullableCoordinate(raw, 'end', fail),
    route,
    prElapsedTimeS: nullableNumber(raw, 'prElapsedTimeS', fail, {
      min: 1,
      max: 7 * 24 * 3600,
      integer: true,
    }),
    prDate: prDate !== null && isCalendarDate(prDate) ? prDate : null,
    effortCount: nullableNumber(raw, 'effortCount', fail, {
      min: 0,
      max: 1_000_000,
      integer: true,
    }),
  };
  return valid ? record : null;
}

function checkEffort(raw: unknown, report: Report): SegmentEffortRecord | null {
  if (!isObject(raw)) {
    report('effort', 'Must be an object.');
    return null;
  }
  let valid = true;
  const fail: Report = (field, message) => {
    valid = false;
    report(field, message);
  };
  const id = (field: string): string | null => {
    const value = raw[field];
    if (value === null || value === undefined) return null;
    if (typeof value !== 'string' || !ID_PATTERN.test(value)) {
      fail(field, 'Must be a positive whole number.');
      return null;
    }
    return value;
  };

  const segmentId = id('segmentId');
  if (segmentId === null && valid) fail('segmentId', 'Is required.');
  const startDate =
    typeof raw.startDate === 'string' && isIsoDateTime(raw.startDate) ? raw.startDate : null;
  if (startDate === null) {
    fail('startDate', 'Must be an ISO 8601 date-time with a time zone, e.g. 2024-06-01T07:12:00Z.');
  }
  const elapsedTimeS = nullableNumber(raw, 'elapsedTimeS', fail, {
    min: 1,
    max: 7 * 24 * 3600,
    integer: true,
  });
  if (raw.elapsedTimeS === null || raw.elapsedTimeS === undefined) {
    fail('elapsedTimeS', 'Is required.');
  }

  const effort: SegmentEffortRecord = {
    segmentId: segmentId ?? '',
    effortId: id('effortId'),
    activityId: id('activityId'),
    startDate: startDate === null ? '' : new Date(startDate).toISOString(),
    elapsedTimeS: elapsedTimeS ?? 0,
    movingTimeS: nullableNumber(raw, 'movingTimeS', fail, {
      min: 0,
      max: 7 * 24 * 3600,
      integer: true,
    }),
  };
  return valid ? effort : null;
}

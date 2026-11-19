import type { ComparisonMetric, DateRange, LocationQuery, RouteFrequencyQuery } from '@/types';
import { isValidLatitude, isValidLongitude } from '../../../utils/geo';
import { DEFAULT_VISIT_RADIUS_M } from './locationVisits';

/*
 * Input of the analytics API (`/api/analytics/*`, ADR-0013 §7), checked independently of any
 * caller (NFR-08). Every parameter is named, typed and bounded, so a later assistant can only ask
 * the questions these functions answer.
 *
 * Only relative and type-only imports: the local backend loads this file without the `@/` alias.
 */

export const ANALYTICS_LIMITS = {
  radiusM: { min: 1, max: 5000 },
  /** Largest area for road frequency, in degrees per side (~111 km north–south). */
  maxAreaDegrees: 1,
  limit: { min: 1, max: 500, default: 20 },
} as const;

export const COMPARISON_METRICS: readonly ComparisonMetric[] = [
  'distanceKm',
  'rideCount',
  'elevationGainM',
  'movingTimeS',
  'locationVisits',
];

export type Parsed<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: readonly string[] };

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A real calendar date in `YYYY-MM-DD` form. */
export function isCalendarDate(value: string): boolean {
  const match = DATE.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

function readRange(
  params: URLSearchParams,
  from: string,
  to: string,
  problems: string[],
): DateRange {
  const read = (name: string) => {
    const value = params.get(name);
    if (value === null || value === '') return null;
    if (!isCalendarDate(value)) {
      problems.push(`${name} must be a date as YYYY-MM-DD.`);
      return null;
    }
    return value;
  };
  const range = { from: read(from), to: read(to) };
  if (range.from !== null && range.to !== null && range.from > range.to) {
    problems.push(`${from} must not be after ${to}.`);
  }
  return range;
}

function readNumber(
  params: URLSearchParams,
  name: string,
  problems: string[],
  check: (value: number) => boolean,
  message: string,
  fallback?: number,
): number {
  const raw = params.get(name);
  if (raw === null || raw.trim() === '') {
    if (fallback !== undefined) return fallback;
    problems.push(`${name} is required.`);
    return Number.NaN;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || !check(value)) {
    problems.push(`${name} ${message}`);
  }
  return value;
}

const result = <T>(problems: string[], value: T): Parsed<T> =>
  problems.length > 0 ? { ok: false, problems } : { ok: true, value };

/** `?from=&to=` (both optional) for distance by month or year. */
export function parseRangeQuery(params: URLSearchParams): Parsed<DateRange> {
  const problems: string[] = [];
  const range = readRange(params, 'from', 'to', problems);
  return result(problems, range);
}

function readLocation(params: URLSearchParams, problems: string[]) {
  const { min, max } = ANALYTICS_LIMITS.radiusM;
  return {
    latitude: readNumber(
      params,
      'lat',
      problems,
      isValidLatitude,
      'must be a latitude (−90 to 90).',
    ),
    longitude: readNumber(
      params,
      'lng',
      problems,
      isValidLongitude,
      'must be a longitude (−180 to 180).',
    ),
    radiusM: readNumber(
      params,
      'radiusM',
      problems,
      (v) => v >= min && v <= max,
      `must be ${min}–${max} metres.`,
      DEFAULT_VISIT_RADIUS_M,
    ),
  };
}

/** `?lat=&lng=&radiusM=&from=&to=` for location visits (radius defaults to 100 m, RULE-24). */
export function parseLocationQuery(params: URLSearchParams): Parsed<LocationQuery> {
  const problems: string[] = [];
  const location = readLocation(params, problems);
  const range = readRange(params, 'from', 'to', problems);
  return result(problems, { ...location, range });
}

/** `?south=&west=&north=&east=&limit=&from=&to=` for the most ridden roads in an area. */
export function parseRouteFrequencyQuery(params: URLSearchParams): Parsed<RouteFrequencyQuery> {
  const problems: string[] = [];
  const south = readNumber(params, 'south', problems, isValidLatitude, 'must be a latitude.');
  const north = readNumber(params, 'north', problems, isValidLatitude, 'must be a latitude.');
  const west = readNumber(params, 'west', problems, isValidLongitude, 'must be a longitude.');
  const east = readNumber(params, 'east', problems, isValidLongitude, 'must be a longitude.');
  const { min, max } = ANALYTICS_LIMITS.limit;
  const limit = readNumber(
    params,
    'limit',
    problems,
    (v) => Number.isInteger(v) && v >= min && v <= max,
    `must be a whole number ${min}–${max}.`,
    ANALYTICS_LIMITS.limit.default,
  );
  const range = readRange(params, 'from', 'to', problems);
  if (problems.length === 0) {
    const span = ANALYTICS_LIMITS.maxAreaDegrees;
    if (south > north) problems.push('south must not be north of north.');
    if (west > east)
      problems.push('west must not be east of east (areas across 180° are not supported).');
    if (north - south > span || east - west > span) {
      problems.push(`The area may be at most ${span}° on each side.`);
    }
  }
  return result(problems, { bounds: { south, west, north, east }, limit, range });
}

export interface ComparisonQuery {
  readonly metric: ComparisonMetric;
  readonly periodA: DateRange;
  readonly periodB: DateRange;
  /** Only for `locationVisits`. */
  readonly location: Omit<LocationQuery, 'range'> | null;
}

/**
 * `?metric=&aFrom=&aTo=&bFrom=&bTo=` (and `lat=&lng=&radiusM=` for `locationVisits`) to compare
 * two periods. Each period needs both ends.
 */
export function parseComparisonQuery(params: URLSearchParams): Parsed<ComparisonQuery> {
  const problems: string[] = [];
  const metric = params.get('metric') as ComparisonMetric | null;
  if (metric === null || !COMPARISON_METRICS.includes(metric)) {
    problems.push(`metric must be one of: ${COMPARISON_METRICS.join(', ')}.`);
  }
  const periodA = readRange(params, 'aFrom', 'aTo', problems);
  const periodB = readRange(params, 'bFrom', 'bTo', problems);
  for (const [name, value] of [
    ['aFrom', periodA.from],
    ['aTo', periodA.to],
    ['bFrom', periodB.from],
    ['bTo', periodB.to],
  ] as const) {
    if (value === null && !params.get(name)) problems.push(`${name} is required.`);
  }
  const location = metric === 'locationVisits' ? readLocation(params, problems) : null;
  return result(problems, {
    metric: metric ?? 'distanceKm',
    periodA,
    periodB,
    location,
  });
}

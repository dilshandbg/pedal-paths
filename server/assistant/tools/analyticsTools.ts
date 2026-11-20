import type { LocationVisits, MonthTotals, YearTotals } from '../../../src/types/analytics';
import { localDate } from '../../../src/features/analytics/services/dateRange';
import { DEFAULT_VISIT_RADIUS_M } from '../../../src/features/analytics/services/locationVisits';
import {
  ANALYTICS_LIMITS,
  COMPARISON_METRICS,
  parseComparisonQuery,
  parseLocationQuery,
  parseRangeQuery,
  parseRouteFrequencyQuery,
  type Parsed,
} from '../../../src/features/analytics/services/parseAnalyticsQuery';
import type { RideAnalytics } from '../../analytics/rideAnalytics';
import type { JsonSchemaObject, JsonSchemaProperty, ToolDefinition } from '../llm/types';

/*
 * The BR-38 analytics as assistant tools (BR-39, RULE-25, RULE-28, ADR-0014 §4).
 *
 * - Every call is validated by the same parsers as `/api/analytics`, so a model can't ask anything
 *   the HTTP API would refuse. Invalid arguments compute nothing and go back as problems (AC-44).
 * - The analytics run here, locally. The model receives only what the question needs: totals,
 *   counts, dates and, for location questions, a few ride names; never GPS points (RULE-28).
 * - Results are limited to `MAX_TOOL_RESULT_BYTES`; a cut result says so.
 */

export const MAX_TOOL_RESULT_BYTES = 8 * 1024;
/** Most ridden roads returned to the model at most. */
export const MAX_ROADS = 25;
/** Rides named in a location-visit result at most (the newest ones). */
export const MAX_NAMED_VISITS = 10;

export interface ToolRun {
  readonly ok: boolean;
  /** JSON text for the model. */
  readonly content: string;
}

export interface AssistantTool {
  readonly definition: ToolDefinition;
  /** E.g. `distance by month`. */
  readonly label: string;
  /** The arguments as a user would read them. */
  summarize(args: unknown): string;
  run(args: unknown): ToolRun;
}

export interface AnalyticsToolOptions {
  /** Time zone for the dates of individual rides; the machine's by default. */
  readonly timeZone?: string;
}

const DATE_PATTERN = '^\\d{4}-\\d{2}-\\d{2}$';
const date = (description: string): JsonSchemaProperty => ({
  type: 'string',
  description: `${description} Format YYYY-MM-DD.`,
  pattern: DATE_PATTERN,
});
const RANGE: Record<string, JsonSchemaProperty> = {
  from: date('First day to include (optional; omit for no lower limit).'),
  to: date('Last day to include (optional; omit for no upper limit).'),
};
const LATITUDE: JsonSchemaProperty = {
  type: 'number',
  description: 'Latitude in decimal degrees.',
  minimum: -90,
  maximum: 90,
};
const LONGITUDE: JsonSchemaProperty = {
  type: 'number',
  description: 'Longitude in decimal degrees.',
  minimum: -180,
  maximum: 180,
};
const RADIUS: JsonSchemaProperty = {
  type: 'number',
  description: `Radius around the place in metres (default ${DEFAULT_VISIT_RADIUS_M}).`,
  minimum: ANALYTICS_LIMITS.radiusM.min,
  maximum: ANALYTICS_LIMITS.radiusM.max,
};

const schema = (
  properties: Record<string, JsonSchemaProperty>,
  required: readonly string[] = [],
): JsonSchemaObject => ({ type: 'object', properties, required, additionalProperties: false });

/** Turns a model's JSON arguments into query parameters for the shared parsers. */
function toParams(args: unknown, definition: ToolDefinition): Parsed<URLSearchParams> {
  const source = args ?? {};
  if (typeof source !== 'object' || Array.isArray(source)) {
    return { ok: false, problems: ['The arguments must be a JSON object.'] };
  }
  const problems: string[] = [];
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(source)) {
    if (!(key in definition.parameters.properties)) {
      problems.push(`Unknown argument "${key}".`);
    } else if (value === null || value === undefined || value === '') {
      continue;
    } else if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      params.set(key, String(value));
    } else {
      problems.push(`${key} must be a single value.`);
    }
  }
  return problems.length > 0 ? { ok: false, problems } : { ok: true, value: params };
}

const round = (value: number, decimals: number) => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

const totals = (entry: MonthTotals | YearTotals) => ({
  rides: entry.rideCount,
  distanceKm: round(entry.distanceKm, 1),
  elevationGainM: Math.round(entry.elevationGainM),
  movingTimeH: round(entry.movingTimeS / 3600, 1),
  ...(entry.ridesWithoutDistance > 0
    ? { ridesWithoutKnownDistance: entry.ridesWithoutDistance }
    : {}),
});

const rangeText = (args: unknown, from = 'from', to = 'to'): string => {
  const record = (args && typeof args === 'object' ? args : {}) as Record<string, unknown>;
  const a = typeof record[from] === 'string' ? record[from] : null;
  const b = typeof record[to] === 'string' ? record[to] : null;
  if (a && b) return `${a} – ${b}`;
  if (a) return `from ${a}`;
  if (b) return `until ${b}`;
  return 'all rides';
};

/**
 * JSON for the model, at most `MAX_TOOL_RESULT_BYTES`. If it is larger, entries are dropped from
 * the end of `listKey` and the result says how many, so the model can ask for a narrower range.
 */
function fit(result: Record<string, unknown>, listKey: string | null): string {
  let text = JSON.stringify(result);
  if (text.length <= MAX_TOOL_RESULT_BYTES || listKey === null) return text;
  const list = result[listKey];
  if (!Array.isArray(list)) return text;
  let keep = list.length;
  while (keep > 0 && text.length > MAX_TOOL_RESULT_BYTES) {
    keep = Math.floor(keep * 0.8);
    text = JSON.stringify({
      ...result,
      [listKey]: list.slice(0, keep),
      truncated: {
        omittedEntries: list.length - keep,
        note: 'The result was too long. Ask again with a narrower date range for the rest.',
      },
    });
  }
  return text;
}

function tool(
  definition: ToolDefinition,
  label: string,
  summarize: (args: unknown) => string,
  execute: (params: URLSearchParams) => Parsed<string>,
): AssistantTool {
  return {
    definition,
    label,
    summarize,
    run(args) {
      const params = toParams(args, definition);
      const outcome = params.ok ? execute(params.value) : params;
      return outcome.ok
        ? { ok: true, content: outcome.value }
        : {
            ok: false,
            content: JSON.stringify({ error: 'invalid-arguments', problems: outcome.problems }),
          };
    },
  };
}

/** Maps a parsed query to a result, or passes the parser's problems on. */
const then = <T>(parsed: Parsed<T>, compute: (value: T) => string): Parsed<string> =>
  parsed.ok ? { ok: true, value: compute(parsed.value) } : parsed;

/** The assistant's analytics tools over the stored history. */
// Implements: BR-39, RULE-25, RULE-28, AC-44
export function createAnalyticsTools(
  analytics: RideAnalytics,
  options: AnalyticsToolOptions = {},
): readonly AssistantTool[] {
  const { timeZone } = options;
  return [
    tool(
      {
        name: 'distance_by_month',
        description:
          'Ride count, distance (km), elevation gain (m) and moving time (h) per calendar month, for months with at least one ride, oldest first.',
        parameters: schema(RANGE),
      },
      'distance by month',
      (args) => rangeText(args),
      (params) =>
        then(parseRangeQuery(params), (range) =>
          fit(
            {
              months: analytics.distanceByMonth(range).map((entry) => ({
                year: entry.year,
                month: entry.month,
                ...totals(entry),
              })),
            },
            'months',
          ),
        ),
    ),
    tool(
      {
        name: 'distance_by_year',
        description:
          'Ride count, distance (km), elevation gain (m) and moving time (h) per calendar year, for years with at least one ride, oldest first.',
        parameters: schema(RANGE),
      },
      'distance by year',
      (args) => rangeText(args),
      (params) =>
        then(parseRangeQuery(params), (range) =>
          fit(
            {
              years: analytics
                .distanceByYear(range)
                .map((entry) => ({ year: entry.year, ...totals(entry) })),
            },
            'years',
          ),
        ),
    ),
    tool(
      {
        name: 'location_visits',
        description:
          'How many distinct rides passed within a radius of a place, with the first and last visit and the newest visiting rides.',
        parameters: schema({ lat: LATITUDE, lng: LONGITUDE, radiusM: RADIUS, ...RANGE }, [
          'lat',
          'lng',
        ]),
      },
      'location visits',
      (args) => {
        const record = (args && typeof args === 'object' ? args : {}) as Record<string, unknown>;
        const radius = typeof record.radiusM === 'number' ? record.radiusM : DEFAULT_VISIT_RADIUS_M;
        return `${String(record.lat)}, ${String(record.lng)} within ${radius} m, ${rangeText(args)}`;
      },
      (params) =>
        then(parseLocationQuery(params), (query) =>
          fit(describeVisits(analytics.locationVisits(query), timeZone), 'newestRides'),
        ),
    ),
    tool(
      {
        name: 'route_frequency',
        description:
          'The most ridden ~100 m pieces of road inside an area, by the number of distinct rides that used them.',
        parameters: schema(
          {
            south: { ...LATITUDE, description: 'Southern edge, latitude in decimal degrees.' },
            west: { ...LONGITUDE, description: 'Western edge, longitude in decimal degrees.' },
            north: { ...LATITUDE, description: 'Northern edge, latitude in decimal degrees.' },
            east: { ...LONGITUDE, description: 'Eastern edge, longitude in decimal degrees.' },
            limit: {
              type: 'integer',
              description: `How many roads to return (default 10).`,
              minimum: 1,
              maximum: MAX_ROADS,
            },
            ...RANGE,
          },
          ['south', 'west', 'north', 'east'],
        ),
      },
      'most ridden roads',
      (args) => rangeText(args),
      (params) => {
        const limit = params.get('limit');
        if (limit !== null && !(Number(limit) >= 1 && Number(limit) <= MAX_ROADS)) {
          return { ok: false, problems: [`limit must be a whole number 1–${MAX_ROADS}.`] };
        }
        if (limit === null) params.set('limit', '10');
        return then(parseRouteFrequencyQuery(params), (query) =>
          fit(
            {
              roads: analytics.routeFrequency(query).map((road) => ({
                lat: round(road.latitude, 5),
                lng: round(road.longitude, 5),
                rides: road.rideCount,
              })),
            },
            'roads',
          ),
        );
      },
    ),
    tool(
      {
        name: 'compare_periods',
        description:
          'Compares one metric between two periods: the value in each and the difference (B − A). locationVisits also needs lat and lng.',
        parameters: schema(
          {
            metric: {
              type: 'string',
              description: 'What to compare.',
              enum: COMPARISON_METRICS,
            },
            aFrom: date('First day of period A.'),
            aTo: date('Last day of period A.'),
            bFrom: date('First day of period B.'),
            bTo: date('Last day of period B.'),
            lat: { ...LATITUDE, description: 'Latitude, only for locationVisits.' },
            lng: { ...LONGITUDE, description: 'Longitude, only for locationVisits.' },
            radiusM: { ...RADIUS, description: 'Radius in metres, only for locationVisits.' },
          },
          ['metric', 'aFrom', 'aTo', 'bFrom', 'bTo'],
        ),
      },
      'period comparison',
      (args) => {
        const record = (args && typeof args === 'object' ? args : {}) as Record<string, unknown>;
        return `${String(record.metric)}: ${rangeText(args, 'aFrom', 'aTo')} vs ${rangeText(args, 'bFrom', 'bTo')}`;
      },
      (params) =>
        then(parseComparisonQuery(params), (query) => {
          const result = analytics.comparePeriods(query);
          const value = (v: number) =>
            result.metric === 'movingTimeS' ? round(v / 3600, 1) : round(v, 1);
          return fit(
            {
              metric: result.metric === 'movingTimeS' ? 'movingTimeH' : result.metric,
              periodA: { ...result.periodA, value: value(result.periodA.value) },
              periodB: { ...result.periodB, value: value(result.periodB.value) },
              difference: value(result.difference),
              percentChange: result.percentChange === null ? null : round(result.percentChange, 1),
            },
            null,
          );
        }),
    ),
  ];
}

/** A location-visit result without ride IDs, and only the newest rides by name (RULE-28). */
function describeVisits(visits: LocationVisits, timeZone: string | undefined) {
  const day = (iso: string) => localDate(iso, timeZone) ?? iso;
  const first = visits.rides[0];
  const last = visits.rides[visits.rides.length - 1];
  const newest = visits.rides.slice(-MAX_NAMED_VISITS).reverse();
  return {
    place: { lat: visits.latitude, lng: visits.longitude },
    radiusM: visits.radiusM,
    visitCount: visits.visitCount,
    firstVisit: first ? day(first.activityDate) : null,
    lastVisit: last ? day(last.activityDate) : null,
    newestRides: newest.map((ride) => ({
      name: ride.activityName,
      date: day(ride.activityDate),
      closestM: Math.round(ride.closestM),
    })),
    ...(visits.rides.length > newest.length
      ? { otherRidesNotListed: visits.rides.length - newest.length }
      : {}),
  };
}

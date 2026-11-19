import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  ANALYTICS_LIMITS,
  COMPARISON_METRICS,
  parseComparisonQuery,
  parseLocationQuery,
  parseRangeQuery,
  parseRouteFrequencyQuery,
  type Parsed,
} from '../../src/features/analytics/services/parseAnalyticsQuery';
import { DEFAULT_VISIT_RADIUS_M } from '../../src/features/analytics/services/locationVisits';
import type { RideAnalytics } from '../analytics/rideAnalytics';
import {
  ApiError,
  apiMiddleware,
  checkLocalRequest,
  pathUnder,
  send,
  type Middleware,
} from './apiSupport';

/*
 * Read-only API of the ride analytics (BR-38, ADR-0013 §7), local and checked like the other
 * APIs (NFR-07, NFR-08). `GET /api/analytics` lists the functions and their parameters, so a
 * later assistant can call them without knowing this code.
 */

export const ANALYTICS_PREFIX = '/api/analytics';

const range = 'from, to: optional dates YYYY-MM-DD, inclusive';

/** The functions, as `GET /api/analytics` describes them. */
export const ANALYTICS_CATALOG = [
  {
    name: 'distance-by-month',
    description: 'Rides, distance (km), elevation gain (m) and moving time (s) per month.',
    parameters: range,
  },
  {
    name: 'distance-by-year',
    description: 'Rides, distance (km), elevation gain (m) and moving time (s) per year.',
    parameters: range,
  },
  {
    name: 'location-visits',
    description: 'Distinct rides that passed within a radius of a place.',
    parameters: `lat, lng: required; radiusM: ${ANALYTICS_LIMITS.radiusM.min}–${ANALYTICS_LIMITS.radiusM.max}, default ${DEFAULT_VISIT_RADIUS_M}; ${range}`,
  },
  {
    name: 'route-frequency',
    description: 'The ~100 m pieces of road in an area used by the most distinct rides.',
    parameters: `south, west, north, east: required, at most ${ANALYTICS_LIMITS.maxAreaDegrees}° per side; limit: ${ANALYTICS_LIMITS.limit.min}–${ANALYTICS_LIMITS.limit.max}, default ${ANALYTICS_LIMITS.limit.default}; ${range}`,
  },
  {
    name: 'compare-periods',
    description: 'One metric in two periods, with the difference.',
    parameters: `metric: ${COMPARISON_METRICS.join(' | ')}; aFrom, aTo, bFrom, bTo: required dates; lat, lng, radiusM: for locationVisits`,
  },
] as const;

function valid<T>(parsed: Parsed<T>): T {
  if (!parsed.ok) throw new ApiError(400, 'invalid-payload', { problems: parsed.problems });
  return parsed.value;
}

/**
 * Creates the `/api/analytics` middleware. `getAnalytics` opens storage on first use; when it
 * fails, requests answer 503 `storage-unavailable`.
 */
// Implements: BR-38, NFR-07, NFR-08
export function createAnalyticsApi(getAnalytics: () => RideAnalytics): Middleware {
  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost');
    checkLocalRequest(req);
    if ((req.method ?? 'GET') !== 'GET') throw new ApiError(405, 'method-not-allowed');
    const name = pathUnder(url, ANALYTICS_PREFIX) ?? '';
    if (name === '') return send(res, 200, { functions: ANALYTICS_CATALOG });

    let analytics: RideAnalytics;
    try {
      analytics = getAnalytics();
    } catch (error) {
      console.error('Ride storage could not be opened:', (error as Error).message);
      throw new ApiError(503, 'storage-unavailable');
    }
    const params = url.searchParams;
    switch (name) {
      case '/distance-by-month':
        return send(res, 200, {
          result: analytics.distanceByMonth(valid(parseRangeQuery(params))),
        });
      case '/distance-by-year':
        return send(res, 200, { result: analytics.distanceByYear(valid(parseRangeQuery(params))) });
      case '/location-visits':
        return send(res, 200, {
          result: analytics.locationVisits(valid(parseLocationQuery(params))),
        });
      case '/route-frequency':
        return send(res, 200, {
          result: analytics.routeFrequency(valid(parseRouteFrequencyQuery(params))),
        });
      case '/compare-periods':
        return send(res, 200, {
          result: analytics.comparePeriods(valid(parseComparisonQuery(params))),
        });
      default:
        throw new ApiError(404, 'not-found');
    }
  }

  return apiMiddleware([ANALYTICS_PREFIX], 'Analytics API', handle);
}

import type {
  AnalyticsTrack,
  DateRange,
  LocationQuery,
  LocationVisits,
  MonthTotals,
  PeriodComparison,
  RoadFrequency,
  RouteFrequencyQuery,
  YearTotals,
} from '../../src/types/analytics';
import type { ComparisonQuery } from '../../src/features/analytics/services/parseAnalyticsQuery';
import { comparePeriods } from '../../src/features/analytics/services/comparePeriods';
import { startedInRange } from '../../src/features/analytics/services/dateRange';
import {
  circleBounds,
  countLocationVisits,
} from '../../src/features/analytics/services/locationVisits';
import {
  distanceByMonth,
  distanceByYear,
  totalRides,
} from '../../src/features/analytics/services/rideTotals';
import { rankRoadFrequency } from '../../src/features/analytics/services/routeFrequency';
import { cellKeyRanges } from '../../src/services/ride-history/rideCells';
import { decodeTrack } from '../../src/services/ride-history/trackCodec';
import type { RideRepository } from '../rides/rideRepository';

/*
 * The analytics over the stored ride history (BR-38, ADR-0013 §7). Each function reads only what
 * it needs from the repository and computes the answer with the pure functions in
 * `src/features/analytics/services`, so the same stored data always gives the same result. A
 * later assistant calls these (through `/api/analytics/*`) instead of working on GPS data itself.
 */

export interface RideAnalytics {
  distanceByMonth(range: DateRange): MonthTotals[];
  distanceByYear(range: DateRange): YearTotals[];
  locationVisits(query: LocationQuery): LocationVisits;
  routeFrequency(query: RouteFrequencyQuery): RoadFrequency[];
  comparePeriods(query: ComparisonQuery): PeriodComparison;
}

/**
 * Analytics over a repository. `timeZone` decides calendar dates, months and years; by default
 * the machine's, which is the browser's (ADR-0007), because the backend runs on the same machine.
 */
// Implements: BR-38, RULE-24
export function createRideAnalytics(repository: RideRepository, timeZone?: string): RideAnalytics {
  /** Rides that may have passed near a place: from the location index, then exact (§5). */
  const tracksNear = (latitude: number, longitude: number, radiusM: number): AnalyticsTrack[] => {
    const ids = repository.ridesInCells(cellKeyRanges(circleBounds(latitude, longitude, radiusM)));
    return repository.ridesWithTracks(ids).map(({ details, track }) => ({
      ...details,
      points: decodeTrack(track),
    }));
  };

  return {
    distanceByMonth: (range) => distanceByMonth(repository.listRideDetails(), range, timeZone),

    distanceByYear: (range) => distanceByYear(repository.listRideDetails(), range, timeZone),

    locationVisits: (query) =>
      countLocationVisits(
        tracksNear(query.latitude, query.longitude, query.radiusM),
        query,
        timeZone,
      ),

    routeFrequency: ({ bounds, limit, range }) => {
      const rides =
        range.from === null && range.to === null
          ? null
          : new Set(
              repository
                .listRideDetails()
                .filter((ride) => startedInRange(ride.activityDate, range, timeZone))
                .map((ride) => ride.activityId),
            );
      return rankRoadFrequency(repository.cellVisits(cellKeyRanges(bounds)), limit, rides);
    },

    comparePeriods: ({ metric, periodA, periodB, location }) => {
      if (metric === 'locationVisits') {
        if (!location) throw new Error('A location comparison needs a place.');
        const tracks = tracksNear(location.latitude, location.longitude, location.radiusM);
        return comparePeriods(
          metric,
          periodA,
          periodB,
          (range) => countLocationVisits(tracks, { ...location, range }, timeZone).visitCount,
        );
      }
      const rides = repository.listRideDetails();
      return comparePeriods(
        metric,
        periodA,
        periodB,
        (range) => totalRides(rides, range, timeZone)[metric],
      );
    },
  };
}

import type { SegmentRecord } from '@/types';

/** A statistic and where it came from: the uploaded file, or computed from the route samples. */
export interface SegmentStatistic {
  readonly value: number;
  readonly source: 'file' | 'samples';
}

export interface SegmentStatistics {
  readonly distanceM: SegmentStatistic | null;
  readonly elevationGainM: SegmentStatistic | null;
  readonly averageGradePct: SegmentStatistic | null;
  readonly maximumGradePct: SegmentStatistic | null;
  readonly elevationLowM: SegmentStatistic | null;
  readonly elevationHighM: SegmentStatistic | null;
}

/** Maximum grade is the steepest stretch of at least this length, so single noisy samples don't count. */
export const MAX_GRADE_WINDOW_M = 100;

const fromFile = (value: number | null): SegmentStatistic | null =>
  value === null ? null : { value, source: 'file' };
const fromSamples = (value: number | null): SegmentStatistic | null =>
  value === null || !Number.isFinite(value) ? null : { value, source: 'samples' };

/** Total ascent: the sum of every rise between consecutive altitude samples. */
function elevationGain(altitude: readonly number[]): number {
  let gain = 0;
  for (let i = 1; i < altitude.length; i += 1) {
    const rise = (altitude[i] ?? 0) - (altitude[i - 1] ?? 0);
    if (rise > 0) gain += rise;
  }
  return gain;
}

/** Net grade over the whole segment, percent. */
function averageGrade(altitude: readonly number[], distance: readonly number[]): number | null {
  const run = (distance.at(-1) ?? 0) - (distance[0] ?? 0);
  if (run <= 0) return null;
  return (((altitude.at(-1) ?? 0) - (altitude[0] ?? 0)) / run) * 100;
}

/**
 * Steepest grade over any stretch of at least `MAX_GRADE_WINDOW_M` (or the whole segment when it
 * is shorter), percent.
 */
function maximumGrade(altitude: readonly number[], distance: readonly number[]): number | null {
  const total = (distance.at(-1) ?? 0) - (distance[0] ?? 0);
  if (total <= 0) return null;
  const window = Math.min(MAX_GRADE_WINDOW_M, total);
  let best: number | null = null;
  let j = 0;
  for (let i = 0; i < distance.length; i += 1) {
    const start = distance[i] ?? 0;
    if (j < i) j = i;
    while (j < distance.length && (distance[j] ?? 0) - start < window) j += 1;
    if (j >= distance.length) break;
    const run = (distance[j] ?? 0) - start;
    const grade = (((altitude[j] ?? 0) - (altitude[i] ?? 0)) / run) * 100;
    if (best === null || grade > best) best = grade;
  }
  return best;
}

/**
 * Segment statistics for display (BR-25, BR-29). A value stated in the uploaded file is used as
 * given. A missing value is computed from the route's altitude and distance samples when the file
 * has them: elevation gain is the sum of rises, average grade the net rise over the distance,
 * maximum grade the steepest `MAX_GRADE_WINDOW_M` stretch, the range the lowest and highest
 * sample, the distance the last distance sample. Otherwise the value is unknown (null); nothing
 * is estimated.
 */
// Implements: BR-25, BR-29, RULE-20
export function segmentStatistics(segment: SegmentRecord): SegmentStatistics {
  const altitude = segment.altitudeSamplesM;
  const distance = segment.distanceSamplesM;
  const both = altitude !== null && distance !== null && altitude.length === distance.length;
  return {
    distanceM:
      fromFile(segment.distanceM) ??
      fromSamples(
        distance && distance.length > 1 ? (distance.at(-1) ?? 0) - (distance[0] ?? 0) : null,
      ),
    elevationGainM:
      fromFile(segment.elevationGainM) ?? fromSamples(altitude ? elevationGain(altitude) : null),
    averageGradePct:
      fromFile(segment.averageGradePct) ??
      fromSamples(both ? averageGrade(altitude, distance) : null),
    maximumGradePct:
      fromFile(segment.maximumGradePct) ??
      fromSamples(both ? maximumGrade(altitude, distance) : null),
    elevationLowM:
      fromFile(segment.elevationLowM) ??
      fromSamples(
        altitude && altitude.length > 0 ? altitude.reduce((a, b) => Math.min(a, b)) : null,
      ),
    elevationHighM:
      fromFile(segment.elevationHighM) ??
      fromSamples(
        altitude && altitude.length > 0 ? altitude.reduce((a, b) => Math.max(a, b)) : null,
      ),
  };
}

import type { Coordinate, PersonalBest, SegmentEffortRecord, SegmentRecord } from '@/types';

/*
 * Segment import rules shared by the browser and the local backend (ADR-0009, ADR-0010).
 * Value imports in this folder must be relative: the backend loads these files outside Vite's alias
 * resolution. Type imports from '@/types' are erased at build time and are fine.
 */

export const LIMITS = {
  /** Largest segment file accepted by the UI (OD-24, provisional). */
  fileBytes: 20 * 1024 * 1024,
  segmentsPerImport: 10_000,
  effortsPerImport: 100_000,
  routePoints: 100_000,
  nameLength: 200,
  textLength: 100,
} as const;

/** Strava IDs are positive integers; they are kept as digit strings to avoid precision loss. */
export const ID_PATTERN = /^[1-9]\d{0,19}$/;

/** `YYYY-MM-DD` with a real calendar date. */
export function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

/** ISO 8601 date-time with a time zone (`Z` or offset), as Strava's `start_date`. */
export function isIsoDateTime(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/.test(value) &&
    !Number.isNaN(new Date(value).getTime())
  );
}

export const isValidCoordinate = (c: Coordinate): boolean =>
  Number.isFinite(c.latitude) &&
  Number.isFinite(c.longitude) &&
  Math.abs(c.latitude) <= 90 &&
  Math.abs(c.longitude) <= 180;

/**
 * Identity of an effort within a segment (RULE-16): its effort ID, or its start time and elapsed
 * time when it has no ID.
 */
export function effortKey(
  effort: Pick<SegmentEffortRecord, 'effortId' | 'startDate' | 'elapsedTimeS'>,
) {
  return effort.effortId ?? `${new Date(effort.startDate).toISOString()}|${effort.elapsedTimeS}`;
}

/** Segment fields compared and merged on update, in display order. */
export const SEGMENT_FIELDS = [
  'name',
  'distanceM',
  'elevationGainM',
  'averageGradePct',
  'maximumGradePct',
  'elevationHighM',
  'elevationLowM',
  'city',
  'state',
  'country',
  'start',
  'end',
  'route',
  'altitudeSamplesM',
  'distanceSamplesM',
  'prElapsedTimeS',
  'prDate',
  'effortCount',
] as const satisfies readonly (keyof SegmentRecord)[];

const sameValue = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * The stored record after an update (RULE-16): every value present in the new file replaces the
 * stored one; values absent from it (null) keep the stored value. Samples belong to their route
 * (RULE-19): a new, different route replaces the stored samples too, with none if it has none.
 */
export function mergeSegment(stored: SegmentRecord | null, incoming: SegmentRecord): SegmentRecord {
  if (!stored) {
    return incoming;
  }
  const merged: Record<string, unknown> = { ...stored, segmentId: stored.segmentId };
  for (const field of SEGMENT_FIELDS) {
    const value = incoming[field];
    if (value !== null) {
      merged[field] = value;
    }
  }
  if (incoming.route !== null && !sameValue(incoming.route, stored.route)) {
    merged.altitudeSamplesM = incoming.altitudeSamplesM;
    merged.distanceSamplesM = incoming.distanceSamplesM;
  }
  return merged as unknown as SegmentRecord;
}

/** Fields whose stored value differs from `next`. */
export function changedFields(stored: SegmentRecord, next: SegmentRecord): string[] {
  return SEGMENT_FIELDS.filter((field) => !sameValue(stored[field], next[field]));
}

/**
 * Personal best (RULE-17): the fastest effort, earliest on a tie. Without efforts, the personal
 * best stated in the imported file.
 */
export function personalBest(
  segment: Pick<SegmentRecord, 'prElapsedTimeS' | 'prDate'>,
  efforts: readonly Pick<SegmentEffortRecord, 'elapsedTimeS' | 'startDate'>[],
): PersonalBest | null {
  let best: Pick<SegmentEffortRecord, 'elapsedTimeS' | 'startDate'> | null = null;
  for (const effort of efforts) {
    if (
      !best ||
      effort.elapsedTimeS < best.elapsedTimeS ||
      (effort.elapsedTimeS === best.elapsedTimeS && effort.startDate < best.startDate)
    ) {
      best = effort;
    }
  }
  if (best) {
    return {
      elapsedTimeS: best.elapsedTimeS,
      date: new Date(best.startDate).toISOString().slice(0, 10),
      source: 'efforts',
    };
  }
  if (segment.prElapsedTimeS !== null) {
    return { elapsedTimeS: segment.prElapsedTimeS, date: segment.prDate, source: 'stated' };
  }
  return null;
}

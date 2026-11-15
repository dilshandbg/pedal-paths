import type { StoredSegment } from '@/types';

/** Sort orders offered in the segment list (BR-25). `name` is the list's natural order. */
export const SEGMENT_SORTS = [
  'name',
  'distance-asc',
  'distance-desc',
  'elevation-desc',
  'elevation-asc',
  'personal-best-asc',
  'personal-best-desc',
] as const;
export type SegmentSort = (typeof SEGMENT_SORTS)[number];

export interface SegmentBrowseCriteria {
  /** Case-insensitive text that the name must contain; blank matches every segment. */
  readonly query: string;
  /** Distance range in km, inclusive. Null means unbounded. */
  readonly minDistanceKm: number | null;
  readonly maxDistanceKm: number | null;
  readonly sort: SegmentSort;
}

export const DEFAULT_BROWSE_CRITERIA: SegmentBrowseCriteria = {
  query: '',
  minDistanceKm: null,
  maxDistanceKm: null,
  sort: 'name',
};

const byName = (a: StoredSegment, b: StoredSegment) =>
  a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) ||
  a.segmentId.localeCompare(b.segmentId);

/** Compares nullable numbers; unknown values always sort last, whatever the direction. */
function byValue(
  value: (segment: StoredSegment) => number | null,
  direction: 1 | -1,
): (a: StoredSegment, b: StoredSegment) => number {
  return (a, b) => {
    const x = value(a);
    const y = value(b);
    if (x === null || y === null) {
      return x === y ? byName(a, b) : x === null ? 1 : -1;
    }
    return (x - y) * direction || byName(a, b);
  };
}

const COMPARATORS: Record<SegmentSort, (a: StoredSegment, b: StoredSegment) => number> = {
  name: byName,
  'distance-asc': byValue((s) => s.distanceM, 1),
  'distance-desc': byValue((s) => s.distanceM, -1),
  'elevation-desc': byValue((s) => s.elevationGainM, -1),
  'elevation-asc': byValue((s) => s.elevationGainM, 1),
  'personal-best-asc': byValue((s) => s.personalBest?.elapsedTimeS ?? null, 1),
  'personal-best-desc': byValue((s) => s.personalBest?.elapsedTimeS ?? null, -1),
};

/**
 * Searches, filters and sorts stored segments (BR-25, AC-25). A segment without a known distance
 * is excluded only while a distance bound is set. Returns a new array; the input is not changed.
 */
// Implements: BR-25, AC-25
export function browseSegments(
  segments: readonly StoredSegment[],
  criteria: SegmentBrowseCriteria,
): StoredSegment[] {
  const query = criteria.query.trim().toLocaleLowerCase('en');
  const minM = criteria.minDistanceKm === null ? null : criteria.minDistanceKm * 1000;
  const maxM = criteria.maxDistanceKm === null ? null : criteria.maxDistanceKm * 1000;

  return segments
    .filter((segment) => {
      if (query !== '' && !segment.name.toLocaleLowerCase('en').includes(query)) return false;
      if (minM === null && maxM === null) return true;
      const distance = segment.distanceM;
      if (distance === null) return false;
      return (minM === null || distance >= minM) && (maxM === null || distance <= maxM);
    })
    .sort(COMPARATORS[criteria.sort]);
}

/** Labels of the sort orders, in menu order. */
export const SEGMENT_SORT_LABELS: Readonly<Record<SegmentSort, string>> = {
  name: 'Name (A–Z)',
  'distance-asc': 'Distance (shortest first)',
  'distance-desc': 'Distance (longest first)',
  'elevation-desc': 'Elevation gain (most first)',
  'elevation-asc': 'Elevation gain (least first)',
  'personal-best-asc': 'Personal best (fastest first)',
  'personal-best-desc': 'Personal best (slowest first)',
};

/** A distance bound typed by the user, in km: blank, negative or not a number means no bound. */
export function parseDistanceInput(text: string): number | null {
  if (text.trim() === '') return null;
  const value = Number(text);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

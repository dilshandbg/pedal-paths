import { IMPORT_STATUS_LABELS } from '@/features/segments/utils/segmentMessages';
import type {
  PersonalBest,
  SegmentDetail,
  SegmentImportPlan,
  SegmentImportStatus,
  StoredSegment,
} from '@/types';
import { formatShortDate } from '@/utils/date';
import { formatDistanceKm, formatElapsedTime, formatElevationM } from '@/utils/units';

/** Display labels of segment fields, for the import review's "changes" column (AC-22). */
const FIELD_LABELS: Readonly<Record<string, string>> = {
  name: 'name',
  distanceM: 'distance',
  elevationGainM: 'elevation gain',
  averageGradePct: 'average grade',
  maximumGradePct: 'maximum grade',
  elevationHighM: 'highest elevation',
  elevationLowM: 'lowest elevation',
  city: 'city',
  state: 'state',
  country: 'country',
  start: 'start',
  end: 'end',
  route: 'route',
  altitudeSamplesM: 'altitude samples',
  distanceSamplesM: 'distance samples',
  prElapsedTimeS: 'personal best',
  prDate: 'personal best date',
  effortCount: 'effort count',
};

const NOT_AVAILABLE = 'Not available';

const distance = (m: number | null) => (m === null ? null : formatDistanceKm(m / 1000));
const elevation = (m: number | null) => (m === null ? null : formatElevationM(m));
const grade = (pct: number | null) => (pct === null ? null : `${pct.toFixed(1)} %`);
/** "YYYY-MM-DD" as a short date, read as a calendar date (no time zone shift). */
const calendarDate = (day: string) => formatShortDate(`${day}T12:00:00Z`, 'UTC');

/** How many altitude and distance samples a route has (BR-29), e.g. "120 altitude, 120 distance". */
function describeSamples(
  altitude: readonly number[] | null,
  distance: readonly number[] | null,
): string {
  const parts = [
    altitude && `${altitude.length.toLocaleString('en-US')} altitude`,
    distance && `${distance.length.toLocaleString('en-US')} distance`,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : NOT_AVAILABLE;
}

export function describePersonalBest(best: PersonalBest | null): string | null {
  if (!best) return null;
  const time = formatElapsedTime(best.elapsedTimeS);
  return best.date ? `${time} on ${calendarDate(best.date)}` : time;
}

export interface SegmentListItem {
  readonly segmentId: string;
  readonly name: string;
  /** "2.7 km · 156 m gain · PB 9:13"; unknown values are left out. */
  readonly details: string;
}

/** One row of the segment list (BR-25). */
export function describeSegmentListItem(segment: StoredSegment): SegmentListItem {
  const parts = [
    distance(segment.distanceM),
    segment.elevationGainM === null ? null : `${elevation(segment.elevationGainM)} gain`,
    segment.personalBest ? `PB ${formatElapsedTime(segment.personalBest.elapsedTimeS)}` : null,
  ].filter((part): part is string => part !== null);
  return { segmentId: segment.segmentId, name: segment.name, details: parts.join(' · ') };
}

export interface SegmentFact {
  readonly label: string;
  readonly value: string;
}

export interface SegmentEffortRow {
  readonly key: string;
  readonly date: string;
  readonly elapsedTime: string;
  readonly movingTime: string;
  readonly isPersonalBest: boolean;
}

export interface SegmentDetailView {
  readonly segmentId: string;
  readonly name: string;
  readonly facts: readonly SegmentFact[];
  readonly efforts: readonly SegmentEffortRow[];
  /** Explains where the personal best comes from when it is not one of the listed efforts. */
  readonly personalBestNote: string | null;
}

/** Metadata and effort history of one segment, formatted for display (BR-25, AC-26). */
// Implements: AC-26, RULE-17
export function describeSegmentDetail(detail: SegmentDetail, timeZone?: string): SegmentDetailView {
  const location = [detail.city, detail.state, detail.country].filter(Boolean).join(', ');
  const facts: SegmentFact[] = [
    { label: 'Strava segment ID', value: detail.segmentId },
    { label: 'Distance', value: distance(detail.distanceM) ?? NOT_AVAILABLE },
    { label: 'Elevation gain', value: elevation(detail.elevationGainM) ?? NOT_AVAILABLE },
    { label: 'Average grade', value: grade(detail.averageGradePct) ?? NOT_AVAILABLE },
    { label: 'Maximum grade', value: grade(detail.maximumGradePct) ?? NOT_AVAILABLE },
    {
      label: 'Elevation range',
      value:
        detail.elevationLowM === null || detail.elevationHighM === null
          ? NOT_AVAILABLE
          : `${elevation(detail.elevationLowM)} – ${elevation(detail.elevationHighM)}`,
    },
    {
      label: 'Altitude and distance samples',
      value: describeSamples(detail.altitudeSamplesM, detail.distanceSamplesM),
    },
    { label: 'Location', value: location || NOT_AVAILABLE },
    { label: 'Personal best', value: describePersonalBest(detail.personalBest) ?? NOT_AVAILABLE },
    {
      label: 'Efforts',
      value:
        detail.effortCount !== null && detail.effortCount !== detail.storedEffortCount
          ? `${detail.storedEffortCount.toLocaleString('en-US')} stored (${detail.effortCount.toLocaleString('en-US')} according to the file)`
          : detail.storedEffortCount.toLocaleString('en-US'),
    },
    { label: 'Last imported from', value: detail.sourceFile ?? NOT_AVAILABLE },
  ];
  return {
    segmentId: detail.segmentId,
    name: detail.name,
    facts,
    efforts: detail.efforts.map((effort, index) => ({
      key: effort.effortId ?? `${effort.startDate}|${effort.elapsedTimeS}|${index}`,
      date: formatShortDate(effort.startDate, timeZone),
      elapsedTime: formatElapsedTime(effort.elapsedTimeS),
      movingTime: effort.movingTimeS === null ? '–' : formatElapsedTime(effort.movingTimeS),
      isPersonalBest: effort.isPersonalBest,
    })),
    personalBestNote:
      detail.personalBest?.source === 'stated'
        ? 'The personal best is the one stated in the imported file; no efforts are stored.'
        : null,
  };
}

export interface ImportReviewRow {
  readonly segmentId: string;
  readonly name: string;
  /** "2.7 km · 156 m gain". */
  readonly figures: string;
  readonly status: SegmentImportStatus;
  readonly statusLabel: string;
  /** "distance, route · 2 new efforts", or empty. */
  readonly changes: string;
}

/** Rows of the import review (AC-22). */
export function describeImportReview(plan: SegmentImportPlan): ImportReviewRow[] {
  return plan.items.map((item) => {
    const figures = [
      distance(item.distanceM),
      item.elevationGainM === null ? null : `${elevation(item.elevationGainM)} gain`,
    ]
      .filter((part): part is string => part !== null)
      .join(' · ');
    const changes = [
      item.changedFields.map((field) => FIELD_LABELS[field] ?? field).join(', '),
      item.newEffortCount > 0
        ? `${item.newEffortCount.toLocaleString('en-US')} new effort${item.newEffortCount === 1 ? '' : 's'}`
        : '',
    ]
      .filter(Boolean)
      .join(' · ');
    return {
      segmentId: item.segmentId,
      name: item.name,
      figures,
      status: item.status,
      statusLabel: IMPORT_STATUS_LABELS[item.status],
      changes,
    };
  });
}

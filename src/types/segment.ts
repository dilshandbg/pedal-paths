import type { LngLat } from './heatmap';

/**
 * Segment domain types (BRD v2.0 BR-20 – BR-27, ADR-0010). Segments are imported from files the
 * user prepares; the application never contacts Strava (BR-28).
 */

/** A WGS84 position in degrees. */
export interface Coordinate {
  readonly latitude: number;
  readonly longitude: number;
}

/** Segment details as imported (normalized from JSON, GeoJSON or CSV). Unknown values are null. */
export interface SegmentRecord {
  /** Strava segment ID, as a string of digits. The unique key (RULE-14). */
  readonly segmentId: string;
  readonly name: string;
  readonly distanceM: number | null;
  readonly elevationGainM: number | null;
  readonly averageGradePct: number | null;
  readonly maximumGradePct: number | null;
  readonly elevationHighM: number | null;
  readonly elevationLowM: number | null;
  readonly city: string | null;
  readonly state: string | null;
  readonly country: string | null;
  readonly start: Coordinate | null;
  readonly end: Coordinate | null;
  /** Route geometry in order, or null when the file has none. */
  readonly route: readonly Coordinate[] | null;
  /**
   * Altitude in metres at each route point (Strava `altitude` stream), aligned with `route`, or
   * null when the file has none (BRD v2.1 BR-29).
   */
  readonly altitudeSamplesM: readonly number[] | null;
  /**
   * Distance from the segment start in metres at each route point (Strava `distance` stream),
   * aligned with `route`, or null when the file has none (BR-29).
   */
  readonly distanceSamplesM: readonly number[] | null;
  /** Personal best stated by the source, in seconds. */
  readonly prElapsedTimeS: number | null;
  /** Date of the stated personal best (`YYYY-MM-DD`). */
  readonly prDate: string | null;
  /** Effort count stated by the source. */
  readonly effortCount: number | null;
}

/** One of the user's efforts on a segment. */
export interface SegmentEffortRecord {
  readonly segmentId: string;
  readonly effortId: string | null;
  readonly activityId: string | null;
  /** ISO 8601 date-time (UTC). */
  readonly startDate: string;
  readonly elapsedTimeS: number;
  readonly movingTimeS: number | null;
}

/** A validated import: the unit sent to the local backend for review and storage. */
export interface SegmentImportPayload {
  readonly sourceFile: string;
  readonly segments: readonly SegmentRecord[];
  readonly efforts: readonly SegmentEffortRecord[];
}

/** One problem found while reading or validating an import file (AC-21). */
export interface SegmentImportProblem {
  /** Where: e.g. "segment 3 (ID 229781)", "row 7", or "file". */
  readonly location: string;
  /** Field name in the file's own terms, or null for a whole-record or whole-file problem. */
  readonly field: string | null;
  readonly message: string;
}

/** What a confirmed import would do to one segment (AC-22). */
export type SegmentImportStatus = 'new' | 'update' | 'unchanged';

export interface SegmentImportPlanItem {
  readonly segmentId: string;
  readonly name: string;
  readonly distanceM: number | null;
  readonly elevationGainM: number | null;
  readonly status: SegmentImportStatus;
  /** Names of the stored fields this import changes (for an update). */
  readonly changedFields: readonly string[];
  /** Efforts in the file that are not stored yet. */
  readonly newEffortCount: number;
}

export interface SegmentImportPlan {
  readonly items: readonly SegmentImportPlanItem[];
  readonly counts: Readonly<Record<SegmentImportStatus, number>>;
  readonly newEffortCount: number;
}

/** Personal best on a segment (RULE-17). */
export interface PersonalBest {
  readonly elapsedTimeS: number;
  /** `YYYY-MM-DD`, or null when unknown. */
  readonly date: string | null;
  /** Fastest stored effort, or the value stated in the imported file. */
  readonly source: 'efforts' | 'stated';
}

/** A stored segment as listed by the backend: details, timestamps and personal best. */
export interface StoredSegment extends SegmentRecord {
  readonly sourceFile: string | null;
  readonly importedAt: string;
  readonly updatedAt: string;
  /** Number of stored efforts. */
  readonly storedEffortCount: number;
  readonly personalBest: PersonalBest | null;
}

/** A stored effort, flagged when it is the segment's personal best. */
export interface StoredSegmentEffort extends SegmentEffortRecord {
  readonly isPersonalBest: boolean;
}

/** A stored segment with its effort history, fastest first. */
export interface SegmentDetail extends StoredSegment {
  readonly efforts: readonly StoredSegmentEffort[];
}

/** One segment route, ready to draw (`[lng, lat]` positions). */
export interface SegmentPath {
  readonly segmentId: string;
  readonly name: string;
  readonly path: readonly LngLat[];
}

/** Render-ready segment overlay for the map (BR-26). Independent of the heat map filters. */
export interface SegmentOverlayData {
  /** Routes to draw; the selected one is last so it is drawn on top. */
  readonly paths: readonly SegmentPath[];
  readonly selectedSegmentId: string | null;
}

/** Error codes of the segment API client, including "the backend is not reachable". */
export type SegmentApiErrorCode =
  | 'invalid-json'
  | 'invalid-payload'
  | 'payload-too-large'
  | 'unsupported-media-type'
  | 'forbidden-origin'
  | 'not-found'
  | 'method-not-allowed'
  | 'storage-unavailable'
  | 'storage-error';

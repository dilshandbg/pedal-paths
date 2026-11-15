import type {
  SegmentDetail,
  SegmentImportPlan,
  SegmentImportProblem,
  StoredSegment,
} from '../../src/types/segment';

export type ImportResult =
  | { readonly ok: true; readonly plan: SegmentImportPlan }
  | { readonly ok: false; readonly problems: readonly SegmentImportProblem[] };

/** Segment storage as the local API uses it (ADR-0011: the JSON segment catalog). */
export interface SegmentRepository {
  /** Every stored segment with route and personal best, without efforts, by name. */
  list(): StoredSegment[];
  /** One stored segment with its efforts, fastest first; null when not stored. */
  get(segmentId: string): SegmentDetail | null;
  /** Validates an import and classifies it against what is stored. Stores nothing (AC-22). */
  preview(input: unknown): ImportResult;
  /** Validates and stores an import as one change: all of it or nothing (BR-23, BR-24). */
  importPayload(input: unknown, now?: Date): ImportResult;
  /** Removes one segment and its efforts. False when it was not stored (BR-27). */
  remove(segmentId: string): boolean;
  /** Removes all segment data. Returns the number of segments removed (BR-27). */
  removeAll(): number;
  close(): void;
}

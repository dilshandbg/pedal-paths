import type { SegmentApiErrorCode, SegmentImportPlan, SegmentImportStatus } from '@/types';
import { LIMITS } from '@/features/segments/services/segmentRules';

/** Segment file types accepted by the upload control (BR-20). */
export const SEGMENT_FILE_ACCEPT =
  '.json,.geojson,.csv,application/json,application/geo+json,text/csv';

/**
 * Checks a chosen segment file before it is read (BR-21, AC-21): supported extension and the size
 * limit. Returns a message, or null when the file can be read.
 */
// Implements: BR-21
export function checkSegmentFile(file: {
  readonly name: string;
  readonly size: number;
}): string | null {
  if (!/\.(json|geojson|csv)$/i.test(file.name.trim())) {
    return 'Unsupported file type. Choose a .json, .geojson or .csv file.';
  }
  if (file.size > LIMITS.fileBytes) {
    return `The file is larger than ${LIMITS.fileBytes / (1024 * 1024)} MB.`;
  }
  return null;
}

/** User-facing text for an API error code. Never includes server details (NFR-08). */
export function describeSegmentApiError(code: SegmentApiErrorCode): string {
  switch (code) {
    case 'storage-unavailable':
      return 'Segment storage is not available. Start the app with "npm run dev" or "npm run preview" so the local database can be used.';
    case 'payload-too-large':
      return 'The import is too large to store.';
    case 'not-found':
      return 'That segment is no longer stored.';
    case 'invalid-payload':
    case 'invalid-json':
      return 'The segment data was rejected as invalid.';
    default:
      return 'Segment storage failed. Please try again.';
  }
}

export const IMPORT_STATUS_LABELS: Readonly<Record<SegmentImportStatus, string>> = {
  new: 'New',
  update: 'Update',
  unchanged: 'Unchanged',
};

const plural = (count: number, word: string) =>
  `${count.toLocaleString('en-US')} ${word}${count === 1 ? '' : 's'}`;

/** "2 new, 1 update, 0 unchanged · 5 new efforts" for the import review (AC-22). */
export function describeImportPlan(plan: SegmentImportPlan): string {
  const { counts } = plan;
  const segments = `${counts.new.toLocaleString('en-US')} new, ${plural(counts.update, 'update')}, ${counts.unchanged.toLocaleString('en-US')} unchanged`;
  return `${segments} · ${plural(plan.newEffortCount, 'new effort')}`;
}

/** Confirmation after an import was stored. */
export function describeImportResult(plan: SegmentImportPlan): string {
  const { counts } = plan;
  const parts = [
    counts.new > 0 ? `added ${plural(counts.new, 'segment')}` : null,
    counts.update > 0 ? `updated ${plural(counts.update, 'segment')}` : null,
    plan.newEffortCount > 0 ? `stored ${plural(plan.newEffortCount, 'new effort')}` : null,
  ].filter((part): part is string => part !== null);
  if (parts.length === 0) return 'Nothing changed: every segment was already up to date.';
  const sentence = parts.join(', ');
  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`;
}

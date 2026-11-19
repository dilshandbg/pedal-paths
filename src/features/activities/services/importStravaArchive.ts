import { classifyActivities } from '@/features/activities/services/classifyActivities';
import {
  normalizeActivity,
  type NormalizeOptions,
} from '@/features/activities/services/normalizeActivity';
import { parseFit } from '@/services/fit/parseFit';
import { parseGpx, type ParsedTrack } from '@/services/gpx/parseGpx';
import {
  ActivitiesCsvFormatError,
  parseActivitiesCsv,
  type ActivityCsvRow,
} from '@/services/strava-export/activitiesCsv';
import {
  CorruptArchiveError,
  NotAZipError,
  decompressActivityFile,
  readStravaArchive,
  type StravaArchiveContents,
} from '@/services/strava-export/archive';
import type {
  CyclingActivity,
  ImportIssue,
  ImportIssueReason,
  ImportResult,
  ImportStatus,
} from '@/types';

export type GpsFileFormat = 'gpx' | 'fit';

/** Detects the GPS format from a Strava `Filename`, ignoring a trailing `.gz` (DATA-02). */
export function detectGpsFormat(fileName: string): GpsFileFormat | null {
  const name = fileName.toLowerCase().replace(/\.gz$/, '');
  if (name.endsWith('.gpx')) {
    return 'gpx';
  }
  if (name.endsWith('.fit')) {
    return 'fit';
  }
  return null;
}

const normalizePath = (path: string) => path.trim().replace(/\\/g, '/').replace(/^\/+/, '');

type TrackResult =
  | { readonly ok: true; readonly track: ParsedTrack }
  | { readonly ok: false; readonly reason: ImportIssueReason };

function readTrack(row: ActivityCsvRow, files: ReadonlyMap<string, Uint8Array>): TrackResult {
  const path = normalizePath(row.fileName);
  if (path === '') {
    return { ok: false, reason: 'missing-gps-file' };
  }
  const format = detectGpsFormat(path);
  if (format === null) {
    return { ok: false, reason: 'unsupported-format' };
  }
  const stored = files.get(path);
  if (!stored) {
    return { ok: false, reason: 'missing-gps-file' };
  }

  try {
    const bytes = decompressActivityFile(path, stored);
    const track =
      format === 'gpx' ? parseGpx(new TextDecoder('utf-8').decode(bytes)) : parseFit(bytes);
    return { ok: true, track };
  } catch {
    return { ok: false, reason: 'malformed-file' };
  }
}

export interface ImportOptions extends NormalizeOptions {
  /** Called with progress updates (UX-02). */
  readonly onStatus?: (status: ImportStatus) => void;
  /** Minimum number of processed rides between progress updates. Defaults to 25. */
  readonly progressInterval?: number;
}

/**
 * Runs the whole Strava export import pipeline (ADR-0004): read the ZIP → parse `activities.csv` →
 * keep Rides → read and parse each Ride's GPX/FIT file → normalize.
 *
 * Per-activity problems become `ImportIssue`s and never abort the import (DATA-05). Archive-level
 * problems return `{ ok: false, reason }` (AC-16). This function never throws for bad input.
 */
// Implements: BR-01, BR-02, BR-03, BR-04, BR-05, DATA-04
export async function importStravaArchive(
  source: ReadableStream<Uint8Array>,
  options: ImportOptions = {},
): Promise<ImportResult> {
  const { onStatus, progressInterval = 25, ...normalizeOptions } = options;
  const fail = (reason: Extract<ImportResult, { ok: false }>['reason']): ImportResult => ({
    ok: false,
    reason,
  });

  onStatus?.({ stage: 'reading-archive' });

  let archive: StravaArchiveContents;
  try {
    archive = await readStravaArchive(source);
  } catch (error) {
    if (error instanceof NotAZipError) {
      return fail('not-a-zip');
    }
    if (error instanceof CorruptArchiveError) {
      return fail('corrupt-archive');
    }
    throw error;
  }

  if (archive.activitiesCsv === null) {
    return fail('missing-activities-csv');
  }

  let rows: ActivityCsvRow[];
  try {
    rows = parseActivitiesCsv(archive.activitiesCsv);
  } catch (error) {
    if (error instanceof ActivitiesCsvFormatError) {
      return fail('missing-activities-csv');
    }
    throw error;
  }

  const { rides, excludedCount } = classifyActivities(rows);
  const activities: CyclingActivity[] = [];
  const issues: ImportIssue[] = [];
  const seenIds = new Set<string>();
  const total = rides.length;

  onStatus?.({ stage: 'parsing-activities', processed: 0, total });

  rides.forEach((row, index) => {
    const id = row.activityId || normalizePath(row.fileName) || `row-${index + 1}`;
    if (seenIds.has(id)) {
      return; // duplicate row in the export
    }
    seenIds.add(id);

    const rowWithId = row.activityId === id ? row : { ...row, activityId: id };
    const trackResult = readTrack(rowWithId, archive.activityFiles);
    if (!trackResult.ok) {
      issues.push({
        activityId: id,
        activityName: row.activityName || null,
        fileName: row.fileName || null,
        reason: trackResult.reason,
      });
    } else {
      const normalized = normalizeActivity(rowWithId, trackResult.track, normalizeOptions);
      if (normalized.ok) {
        activities.push(normalized.activity);
      } else {
        issues.push(normalized.issue);
      }
    }

    const processed = index + 1;
    if (processed % progressInterval === 0 && processed < total) {
      onStatus?.({ stage: 'parsing-activities', processed, total });
    }
  });

  onStatus?.({ stage: 'parsing-activities', processed: total, total });

  if (activities.length === 0) {
    return fail('no-eligible-rides');
  }

  activities.sort((a, b) => b.activityDate.localeCompare(a.activityDate));

  // The heat map index is built over the whole stored history, after the upload is saved
  // (ADR-0013 §4), so it is not built here.
  return { ok: true, activities, issues, excludedNonRideCount: excludedCount };
}

import { MAX_ARCHIVE_BYTES } from '@/features/activities/utils/validateArchiveFile';
import type { ImportFailureReason, ImportIssue, ImportIssueReason } from '@/types';

/** User-facing messages for archives that can't be used (AC-16, AC-17). */
export const IMPORT_FAILURE_MESSAGES: Readonly<Record<ImportFailureReason, string>> = {
  'not-a-zip':
    'This file is not a ZIP archive. Choose the ZIP file you downloaded from Strava, without extracting it.',
  'too-large': `This file is larger than ${MAX_ARCHIVE_BYTES / 1024 ** 3} GB, the largest export this app accepts. Check that you chose your Strava export ZIP.`,
  'corrupt-archive':
    'This ZIP archive could not be read. It may be damaged or incomplete. Try downloading your Strava export again.',
  'missing-activities-csv':
    'This ZIP does not look like a Strava export: it has no activities.csv. Use the archive from Strava’s “Download your data”.',
  'no-eligible-rides':
    'No Ride activities with GPS data were found in this export. Runs, swims, workouts and other activity types are not shown.',
};

/** Short labels for per-activity problems (UX-04). */
export const IMPORT_ISSUE_LABELS: Readonly<Record<ImportIssueReason, string>> = {
  'missing-gps-file': 'No GPS file (e.g. indoor or manual rides)',
  'unsupported-format': 'Unsupported file format (e.g. TCX)',
  'malformed-file': 'GPS file could not be read',
  'no-usable-gps': 'No usable GPS points',
  'missing-date': 'No activity date',
};

export interface IssueGroup {
  readonly reason: ImportIssueReason;
  readonly label: string;
  readonly count: number;
}

/** Groups issues by reason, most frequent first (ties keep label order). */
export function groupIssuesByReason(issues: readonly ImportIssue[]): IssueGroup[] {
  const counts = new Map<ImportIssueReason, number>();
  for (const issue of issues) {
    counts.set(issue.reason, (counts.get(issue.reason) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([reason, count]) => ({ reason, label: IMPORT_ISSUE_LABELS[reason], count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/** "1 ride" / "3 rides". */
export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count.toLocaleString('en-US')} ${count === 1 ? singular : plural}`;
}

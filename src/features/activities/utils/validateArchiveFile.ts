import type { ImportFailureReason } from '@/types';

/** Largest Strava export accepted (BR-17). Provisional value pending owner confirmation (OD-24). */
export const MAX_ARCHIVE_BYTES = 5 * 1024 ** 3;

const ZIP_MIME_TYPES = new Set([
  'application/zip',
  'application/x-zip-compressed',
  'application/x-zip',
  'multipart/x-zip',
]);

/** What the up-front check needs to know about the chosen file. */
export interface ArchiveFileInfo {
  readonly name: string;
  readonly size: number;
  readonly type: string;
}

/**
 * Checks the chosen file before any processing starts (BR-17, AC-17): it must look like a ZIP
 * (`.zip` name or a ZIP media type) and be no larger than {@link MAX_ARCHIVE_BYTES}. The archive's
 * content is checked again when it is opened (`not-a-zip`, `corrupt-archive`).
 */
// Implements: BR-17, AC-17
export function validateArchiveFile(file: ArchiveFileInfo): ImportFailureReason | null {
  const looksLikeZip = /\.zip$/i.test(file.name.trim()) || ZIP_MIME_TYPES.has(file.type);
  if (!looksLikeZip) {
    return 'not-a-zip';
  }
  if (file.size > MAX_ARCHIVE_BYTES) {
    return 'too-large';
  }
  return null;
}

import { importStravaArchive } from '@/features/activities/services/importStravaArchive';
import {
  decodeRideHistory,
  encodeUploadBundle,
} from '@/features/activities/services/rideHistoryBundle';
import { buildSegmentIndex } from '@/features/heatmap/services/buildSegmentIndex';
import { createSha256 } from '@/services/ride-history/sha256';
import type { ArchiveUploadResult, ImportStatus, RestoredHistory } from '@/types';

/*
 * The two jobs of the import worker (ADR-0004, ADR-0013 §4), as plain async functions so they can
 * be tested without a worker.
 */

/** Passes a stream through unchanged while hashing every chunk (BR-37). */
function hashing(source: ReadableStream<Uint8Array>) {
  const sha = createSha256();
  const stream = source.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        sha.update(chunk);
        controller.enqueue(chunk);
      },
    }),
  );
  return { stream, digestHex: () => sha.digestHex() };
}

/**
 * Processes an export ZIP into what `POST /api/uploads` needs: the rides as a ride bundle, the
 * file's SHA-256 (computed while the file is read, so it is read once), and the import summary.
 */
// Implements: BR-01, BR-33, BR-37
export async function prepareUpload(
  file: Blob,
  fileName: string,
  onStatus?: (status: ImportStatus) => void,
): Promise<ArchiveUploadResult> {
  const { stream, digestHex } = hashing(file.stream());
  const result = await importStravaArchive(stream, onStatus ? { onStatus } : {});
  if (!result.ok) return result;

  // The archive reader consumes the stream to its end, so every byte has been hashed.
  const fileHash = digestHex();
  const bundle = encodeUploadBundle(
    {
      fileName,
      fileSizeBytes: file.size,
      fileHash,
      skippedCount: result.issues.length,
      excludedNonRideCount: result.excludedNonRideCount,
    },
    result.activities,
  );
  return {
    ok: true,
    bundle,
    fileHash,
    rideCount: result.activities.length,
    issues: result.issues,
    excludedNonRideCount: result.excludedNonRideCount,
  };
}

/** Decodes the stored history and indexes it for the heat map (BR-33, ADR-0006). */
// Implements: BR-33, AC-34
export function restoreHistory(
  bundle: Uint8Array,
  onStatus?: (status: ImportStatus) => void,
): RestoredHistory {
  const { activities, skippedCount } = decodeRideHistory(bundle);
  onStatus?.({ stage: 'indexing' });
  return { activities, segmentIndex: buildSegmentIndex(activities), skippedCount };
}

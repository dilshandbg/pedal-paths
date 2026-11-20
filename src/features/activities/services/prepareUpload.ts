import { importStravaArchive } from '@/features/activities/services/importStravaArchive';
import { encodeUploadBundle } from '@/features/activities/services/rideHistoryBundle';
import { createSha256 } from '@/services/ride-history/sha256';
import type { ArchiveUploadResult, ImportStatus } from '@/types';

/*
 * The import worker's job (ADR-0004, ADR-0013 §4), as a plain async function so it can be tested
 * without a worker. Restoring the stored history is `restoreHistory`, in its own smaller worker.
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

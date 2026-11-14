import { Unzip, UnzipInflate, gunzipSync, strFromU8 } from 'fflate';

/** The parts of a Strava export this app needs (ADR-0004). */
export interface StravaArchiveContents {
  /** Text of `activities.csv`, or null when the archive has none. */
  readonly activitiesCsv: string | null;
  /**
   * Activity GPS files keyed by their path relative to the export root (`activities/123.gpx.gz`),
   * exactly as the `Filename` column refers to them. Bytes are as stored in the archive, so `.gz`
   * files are still gzip-compressed.
   */
  readonly activityFiles: ReadonlyMap<string, Uint8Array>;
}

export class NotAZipError extends Error {
  constructor() {
    super('The file is not a ZIP archive');
    this.name = 'NotAZipError';
  }
}

export class CorruptArchiveError extends Error {
  constructor(cause: unknown) {
    super('The ZIP archive could not be read', { cause });
    this.name = 'CorruptArchiveError';
  }
}

const ZIP_SIGNATURES = [
  [0x50, 0x4b, 0x03, 0x04], // local file header
  [0x50, 0x4b, 0x05, 0x06], // empty archive
] as const;

function hasZipSignature(bytes: Uint8Array): boolean {
  return ZIP_SIGNATURES.some((signature) =>
    signature.every((byte, index) => bytes[index] === byte),
  );
}

/**
 * Strips a single wrapping folder some unzip/re-zip tools add, so `export_123/activities/1.gpx`
 * and `activities/1.gpx` resolve the same way.
 */
function relativeToExportRoot(path: string): string | null {
  const normalized = path.replace(/\\/g, '/').replace(/^\/+/, '');
  if (normalized === 'activities.csv' || normalized.startsWith('activities/')) {
    return normalized;
  }
  const slash = normalized.indexOf('/');
  if (slash > 0) {
    const rest = normalized.slice(slash + 1);
    if (rest === 'activities.csv' || rest.startsWith('activities/')) {
      return rest;
    }
  }
  return null;
}

function concatChunks(chunks: readonly Uint8Array[]): Uint8Array {
  if (chunks.length === 1 && chunks[0]) {
    return chunks[0];
  }
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

/**
 * Stream-reads a Strava export ZIP and keeps only `activities.csv` and the files under
 * `activities/` (BR-02). Everything else, such as `media/`, is skipped without being inflated, so
 * multi-GB archives don't have to fit in memory.
 *
 * @throws NotAZipError when the data does not start with a ZIP signature.
 * @throws CorruptArchiveError when the ZIP structure or compressed data is invalid.
 */
export async function readStravaArchive(
  source: ReadableStream<Uint8Array>,
): Promise<StravaArchiveContents> {
  const activityFiles = new Map<string, Uint8Array>();
  let activitiesCsv: string | null = null;
  let failure: unknown = null;

  const unzip = new Unzip((entry) => {
    const path = relativeToExportRoot(entry.name);
    if (path === null || path.endsWith('/')) {
      return; // not started → skipped
    }
    const chunks: Uint8Array[] = [];
    entry.ondata = (error, data, final) => {
      if (error) {
        failure ??= error;
        return;
      }
      chunks.push(data);
      if (final) {
        const bytes = concatChunks(chunks);
        if (path === 'activities.csv') {
          activitiesCsv = strFromU8(bytes);
        } else {
          activityFiles.set(path, bytes);
        }
      }
    };
    entry.start();
  });
  unzip.register(UnzipInflate);

  const reader = source.getReader();
  let checkedSignature = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (value && value.length > 0) {
        if (!checkedSignature) {
          if (value.length < 4 || !hasZipSignature(value)) {
            throw new NotAZipError();
          }
          checkedSignature = true;
        }
        unzip.push(value, false);
      }
      if (done) {
        if (!checkedSignature) {
          throw new NotAZipError();
        }
        unzip.push(new Uint8Array(0), true);
        break;
      }
      if (failure) {
        break;
      }
    }
  } catch (error) {
    if (error instanceof NotAZipError) {
      throw error;
    }
    throw new CorruptArchiveError(error);
  } finally {
    reader.releaseLock();
  }

  if (failure) {
    throw new CorruptArchiveError(failure);
  }

  return { activitiesCsv, activityFiles };
}

/** Returns the file bytes, gunzipped when the path ends in `.gz` (Strava's `.gpx.gz` / `.fit.gz`). */
export function decompressActivityFile(path: string, bytes: Uint8Array): Uint8Array {
  return path.toLowerCase().endsWith('.gz') ? gunzipSync(bytes) : bytes;
}

import type {
  ImportWorkerRequest,
  ImportWorkerResponse,
} from '@/features/activities/workers/protocol';
import type { ArchiveUploadResult, ImportStatus, RestoredHistory } from '@/types';

/** Processes an export ZIP for upload. Shared by the worker-backed importer and test doubles. */
export type ArchiveImporter = (
  file: File,
  onStatus: (status: ImportStatus) => void,
) => Promise<ArchiveUploadResult>;

/** Decodes and indexes the stored ride history (`GET /api/rides`). */
export type HistoryRestorer = (
  bundle: Uint8Array,
  onStatus: (status: ImportStatus) => void,
) => Promise<RestoredHistory>;

/**
 * Sends one request to a fresh import worker and resolves with its answer. The worker is
 * terminated when the request settles. Rejects only on unexpected worker failures.
 */
function runInWorker<T>(
  request: ImportWorkerRequest,
  transfer: Transferable[],
  onStatus: (status: ImportStatus) => void,
  pick: (message: ImportWorkerResponse) => T | undefined,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const worker = new Worker(new URL('./importWorker.ts', import.meta.url), {
      type: 'module',
      name: 'strava-import',
    });
    const finish = () => worker.terminate();

    worker.addEventListener('message', (event: MessageEvent<ImportWorkerResponse>) => {
      const message = event.data;
      if (message.type === 'status') {
        onStatus(message.status);
        return;
      }
      finish();
      if (message.type === 'error') {
        reject(new Error(message.message));
        return;
      }
      const value = pick(message);
      if (value === undefined) reject(new Error('Unexpected import worker answer'));
      else resolve(value);
    });
    worker.addEventListener('error', (event) => {
      finish();
      reject(new Error(event.message || 'The import worker failed'));
    });

    worker.postMessage(request, { transfer });
  });
}

/** Processes a Strava export ZIP in a dedicated Web Worker (ADR-0004, ADR-0013 §4). */
export const runImportInWorker: ArchiveImporter = (file, onStatus) =>
  runInWorker({ type: 'import', file, fileName: file.name }, [], onStatus, (message) =>
    message.type === 'imported' ? message.result : undefined,
  );

/**
 * Decodes and indexes the stored ride history in a dedicated Web Worker. The bytes are moved to
 * the worker, so `bundle` is unusable afterwards.
 */
export const runRestoreInWorker: HistoryRestorer = (bundle, onStatus) => {
  // An exact copy when `bundle` is a view into a larger buffer; otherwise its own buffer is moved.
  const buffer =
    bundle.byteOffset === 0 && bundle.byteLength === bundle.buffer.byteLength
      ? (bundle.buffer as ArrayBuffer)
      : bundle.slice().buffer;
  return runInWorker({ type: 'restore', bundle: buffer }, [buffer], onStatus, (message) =>
    message.type === 'restored' ? message.history : undefined,
  );
};

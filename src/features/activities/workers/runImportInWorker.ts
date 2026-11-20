import type {
  HistoryWorkerRequest,
  HistoryWorkerResponse,
  ImportWorkerRequest,
  ImportWorkerResponse,
} from '@/features/activities/workers/protocol';
import { RideHistoryApiError } from '@/services/ride-history-api/rideHistoryClient';
import type { ArchiveUploadResult, ImportStatus, RestoredHistory } from '@/types';

/** Processes an export ZIP for upload. Shared by the worker-backed importer and test doubles. */
export type ArchiveImporter = (
  file: File,
  onStatus: (status: ImportStatus) => void,
) => Promise<ArchiveUploadResult>;

/**
 * Downloads, decodes and indexes the stored ride history (`GET /api/rides`). Rejects with a
 * `RideHistoryApiError` when the ride storage cannot be reached.
 */
export type HistoryRestorer = (
  onStatus: (status: ImportStatus) => void,
) => Promise<RestoredHistory>;

/**
 * Sends one request to a fresh import worker and resolves with its answer. The worker is
 * terminated when the request settles. Rejects only on unexpected worker failures.
 */
function runInWorker<T, Response extends ImportWorkerResponse | HistoryWorkerResponse>(
  createWorker: () => Worker,
  request: ImportWorkerRequest | HistoryWorkerRequest,
  transfer: Transferable[],
  onStatus: (status: ImportStatus) => void,
  pick: (message: Response) => T | undefined,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    // Created in here, so a worker that cannot start rejects like any other failure.
    const worker = createWorker();
    const finish = () => worker.terminate();

    worker.addEventListener('message', (event: MessageEvent<Response>) => {
      const message = event.data;
      if (message.type === 'status') {
        onStatus(message.status);
        return;
      }
      finish();
      if (message.type === 'error') {
        reject(
          'code' in message && message.code
            ? new RideHistoryApiError(message.code)
            : new Error(message.message),
        );
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
  runInWorker<ArchiveUploadResult, ImportWorkerResponse>(
    () =>
      new Worker(new URL('./importWorker.ts', import.meta.url), {
        type: 'module',
        name: 'strava-import',
      }),
    { type: 'import', file, fileName: file.name },
    [],
    onStatus,
    (message) => (message.type === 'imported' ? message.result : undefined),
  );

/** Downloads, decodes and indexes the stored ride history in the history worker (NFR-10). */
export const runRestoreInWorker: HistoryRestorer = (onStatus) =>
  runInWorker<RestoredHistory, HistoryWorkerResponse>(
    () =>
      new Worker(new URL('./historyWorker.ts', import.meta.url), {
        type: 'module',
        name: 'ride-history',
      }),
    { type: 'restore' },
    [],
    onStatus,
    (message) => (message.type === 'restored' ? message.history : undefined),
  );

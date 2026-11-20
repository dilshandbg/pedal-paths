import { prepareUpload } from '@/features/activities/services/prepareUpload';
import type {
  ImportWorkerRequest,
  ImportWorkerResponse,
} from '@/features/activities/workers/protocol';
import type { ImportStatus } from '@/types';

/**
 * Web Worker entry point: processes an export ZIP for upload off the main thread, so the UI never
 * freezes (ADR-0004, ADR-0013, NFR-02). One worker handles one request and is then terminated.
 * Restoring the stored history runs in `historyWorker`.
 */
const post = (message: ImportWorkerResponse, transfer: Transferable[] = []) =>
  self.postMessage(message, { transfer });

const fail = (error: unknown) =>
  post({ type: 'error', message: error instanceof Error ? error.message : String(error) });

self.addEventListener('message', (event: MessageEvent<ImportWorkerRequest>) => {
  const request = event.data;
  if (request.type !== 'import') return;
  const onStatus = (status: ImportStatus) => post({ type: 'status', status });

  prepareUpload(request.file, request.fileName, onStatus)
    .then((result) =>
      // The bundle can be hundreds of MB: move it to the main thread instead of copying.
      // (`encodeRideBundle` allocates a plain ArrayBuffer of exactly the bundle's size.)
      post({ type: 'imported', result }, result.ok ? [result.bundle.buffer as ArrayBuffer] : []),
    )
    .catch(fail);
});

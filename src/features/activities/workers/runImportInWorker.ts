import type {
  ImportWorkerRequest,
  ImportWorkerResponse,
} from '@/features/activities/workers/protocol';
import type { ImportResult, ImportStatus } from '@/types';

/** Signature shared by the real worker-backed importer and test doubles. */
export type ArchiveImporter = (
  file: Blob,
  onStatus: (status: ImportStatus) => void,
) => Promise<ImportResult>;

/**
 * Imports a Strava export ZIP in a dedicated Web Worker (ADR-0004). The worker is terminated when
 * the import settles. Rejects only on unexpected worker failures; bad archives resolve with
 * `{ ok: false }`.
 */
export const runImportInWorker: ArchiveImporter = (file, onStatus) =>
  new Promise<ImportResult>((resolve, reject) => {
    const worker = new Worker(new URL('./importWorker.ts', import.meta.url), {
      type: 'module',
      name: 'strava-import',
    });

    const finish = () => worker.terminate();

    worker.addEventListener('message', (event: MessageEvent<ImportWorkerResponse>) => {
      const message = event.data;
      if (message.type === 'status') {
        onStatus(message.status);
      } else if (message.type === 'result') {
        finish();
        resolve(message.result);
      } else {
        finish();
        reject(new Error(message.message));
      }
    });
    worker.addEventListener('error', (event) => {
      finish();
      reject(new Error(event.message || 'The import worker failed'));
    });

    const request: ImportWorkerRequest = { type: 'import', file };
    worker.postMessage(request);
  });

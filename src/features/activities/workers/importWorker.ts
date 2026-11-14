import { importStravaArchive } from '@/features/activities/services/importStravaArchive';
import type {
  ImportWorkerRequest,
  ImportWorkerResponse,
} from '@/features/activities/workers/protocol';

/**
 * Web Worker entry point: runs the import pipeline off the main thread so large archives never
 * freeze the UI (ADR-0004, NFR-02). One worker handles one import and is then terminated.
 */
const post = (message: ImportWorkerResponse) => self.postMessage(message);

self.addEventListener('message', (event: MessageEvent<ImportWorkerRequest>) => {
  if (event.data.type !== 'import') {
    return;
  }
  importStravaArchive(event.data.file.stream(), {
    onStatus: (status) => post({ type: 'status', status }),
  })
    .then((result) => post({ type: 'result', result }))
    .catch((error: unknown) =>
      post({ type: 'error', message: error instanceof Error ? error.message : String(error) }),
    );
});

import { restoreHistory, transferablesOf } from '@/features/activities/services/restoreHistory';
import type {
  HistoryWorkerRequest,
  HistoryWorkerResponse,
} from '@/features/activities/workers/protocol';
import {
  RideHistoryApiError,
  rideHistoryClient,
} from '@/services/ride-history-api/rideHistoryClient';
import type { ImportStatus } from '@/types';

/**
 * Web Worker entry point: downloads, decodes and indexes the stored ride history off the main thread
 * (BR-33, ADR-0013 §4). Separate from the import worker, so a start does not load the ZIP and
 * FIT parsers (NFR-10). One worker handles one request and is then terminated.
 */
const post = (message: HistoryWorkerResponse, transfer: Transferable[] = []) =>
  self.postMessage(message, { transfer });

self.addEventListener('message', (event: MessageEvent<HistoryWorkerRequest>) => {
  if (event.data.type !== 'restore') return;
  const onStatus = (status: ImportStatus) => post({ type: 'status', status });
  // The worker starts while the page loads, so loading it overlaps the download (NFR-10).
  rideHistoryClient
    .fetchRides()
    .then((bundle) => {
      const history = restoreHistory(bundle, onStatus);
      post({ type: 'restored', history }, transferablesOf(history));
    })
    .catch((error: unknown) =>
      post({
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
        ...(error instanceof RideHistoryApiError ? { code: error.code } : {}),
      }),
    );
});

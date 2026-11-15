import { parseSegmentFile } from '@/features/segments/services/parseSegmentFile';
import type {
  SegmentFileWorkerRequest,
  SegmentFileWorkerResponse,
} from '@/features/segments/workers/protocol';

/**
 * Web Worker entry point: reads and validates a segment file off the main thread, so a large
 * file never freezes the UI. One worker handles one file and is then terminated.
 */
const post = (message: SegmentFileWorkerResponse) => self.postMessage(message);

self.addEventListener('message', (event: MessageEvent<SegmentFileWorkerRequest>) => {
  if (event.data.type !== 'parse') {
    return;
  }
  const { file, fileName, knownSegmentIds } = event.data;
  file
    .text()
    .then((text) =>
      post({ type: 'result', result: parseSegmentFile(fileName, text, new Set(knownSegmentIds)) }),
    )
    .catch((error: unknown) =>
      post({ type: 'error', message: error instanceof Error ? error.message : String(error) }),
    );
});

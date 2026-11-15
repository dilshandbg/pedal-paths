import type { SegmentFileResult } from '@/features/segments/services/parseSegmentFile';
import type {
  SegmentFileWorkerRequest,
  SegmentFileWorkerResponse,
} from '@/features/segments/workers/protocol';

/** Signature shared by the real worker-backed parser and test doubles. */
export type SegmentFileParser = (
  file: File,
  knownSegmentIds: readonly string[],
) => Promise<SegmentFileResult>;

/**
 * Parses a segment file in a dedicated Web Worker. Rejects only on unexpected worker failures;
 * invalid files resolve with `{ ok: false, problems }`.
 */
export const runSegmentParseInWorker: SegmentFileParser = (file, knownSegmentIds) =>
  new Promise<SegmentFileResult>((resolve, reject) => {
    const worker = new Worker(new URL('./segmentFileWorker.ts', import.meta.url), {
      type: 'module',
      name: 'segment-file',
    });
    const finish = () => worker.terminate();

    worker.addEventListener('message', (event: MessageEvent<SegmentFileWorkerResponse>) => {
      finish();
      if (event.data.type === 'result') {
        resolve(event.data.result);
      } else {
        reject(new Error(event.data.message));
      }
    });
    worker.addEventListener('error', (event) => {
      finish();
      reject(new Error(event.message || 'The segment file worker failed'));
    });

    const request: SegmentFileWorkerRequest = {
      type: 'parse',
      file,
      fileName: file.name,
      knownSegmentIds: [...knownSegmentIds],
    };
    worker.postMessage(request);
  });

import type { SegmentFileResult } from '@/features/segments/services/parseSegmentFile';

/** Main thread → segment file worker. */
export interface SegmentFileWorkerRequest {
  readonly type: 'parse';
  readonly file: Blob;
  readonly fileName: string;
  readonly knownSegmentIds: readonly string[];
}

/** Segment file worker → main thread. */
export type SegmentFileWorkerResponse =
  | { readonly type: 'result'; readonly result: SegmentFileResult }
  | { readonly type: 'error'; readonly message: string };

import type { ImportResult, ImportStatus } from '@/types';

/** Main thread → import worker. */
export interface ImportWorkerRequest {
  readonly type: 'import';
  readonly file: Blob;
}

/** Import worker → main thread. */
export type ImportWorkerResponse =
  | { readonly type: 'status'; readonly status: ImportStatus }
  | { readonly type: 'result'; readonly result: ImportResult }
  | { readonly type: 'error'; readonly message: string };

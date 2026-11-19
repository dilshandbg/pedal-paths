import type { ArchiveUploadResult, ImportStatus, RestoredHistory } from '@/types';

/** Main thread → import worker. */
export type ImportWorkerRequest =
  /** Process an export ZIP into a ride bundle for upload, hashing it on the way (ADR-0013 §4). */
  | { readonly type: 'import'; readonly file: Blob; readonly fileName: string }
  /** Decode the stored history (`GET /api/rides`) and build the heat map index over it. */
  | { readonly type: 'restore'; readonly bundle: ArrayBuffer };

/** Import worker → main thread. */
export type ImportWorkerResponse =
  | { readonly type: 'status'; readonly status: ImportStatus }
  | { readonly type: 'imported'; readonly result: ArchiveUploadResult }
  | { readonly type: 'restored'; readonly history: RestoredHistory }
  | { readonly type: 'error'; readonly message: string };

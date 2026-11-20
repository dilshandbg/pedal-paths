import type {
  ArchiveUploadResult,
  ImportStatus,
  RestoredHistory,
  RideHistoryApiErrorCode,
} from '@/types';

/** Main thread → import worker: process an export ZIP for upload, hashing it (ADR-0013 §4). */
export interface ImportWorkerRequest {
  readonly type: 'import';
  readonly file: Blob;
  readonly fileName: string;
}

/** Import worker → main thread. */
export type ImportWorkerResponse =
  | { readonly type: 'status'; readonly status: ImportStatus }
  | { readonly type: 'imported'; readonly result: ArchiveUploadResult }
  | { readonly type: 'error'; readonly message: string };

/**
 * Main thread → history worker: download the stored history (`GET /api/rides`), decode it and
 * index it. The worker downloads it itself, so the page never holds or copies it (NFR-10).
 */
export interface HistoryWorkerRequest {
  readonly type: 'restore';
}

/** History worker → main thread. `code` is the ride history API's error code, when it failed. */
export type HistoryWorkerResponse =
  | { readonly type: 'status'; readonly status: ImportStatus }
  | { readonly type: 'restored'; readonly history: RestoredHistory }
  | {
      readonly type: 'error';
      readonly message: string;
      readonly code?: RideHistoryApiErrorCode;
    };

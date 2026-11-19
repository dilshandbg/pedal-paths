import type { RideHistoryApiErrorCode, UploadRecord } from '@/types';

/*
 * Client for the local ride history API (ADR-0013 §4). Same origin only: rides only travel between
 * the browser and the local backend on this machine (NFR-07).
 */

export class RideHistoryApiError extends Error {
  constructor(
    readonly code: RideHistoryApiErrorCode,
    /** For `duplicate-file`: the earlier upload of the same file (BR-37). */
    readonly existingUpload: UploadRecord | null = null,
  ) {
    super(code);
    this.name = 'RideHistoryApiError';
  }
}

const KNOWN_CODES: ReadonlySet<string> = new Set<RideHistoryApiErrorCode>([
  'invalid-json',
  'invalid-payload',
  'payload-too-large',
  'unsupported-media-type',
  'forbidden-origin',
  'not-found',
  'method-not-allowed',
  'storage-unavailable',
  'storage-error',
  'duplicate-file',
]);

const contentType = (response: Response) => response.headers.get('content-type') ?? '';

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(path, { ...init, credentials: 'same-origin' });
  } catch {
    throw new RideHistoryApiError('storage-unavailable');
  }
  if (response.ok) return response;
  if (!contentType(response).includes('application/json')) {
    throw new RideHistoryApiError('storage-unavailable'); // e.g. a static file server
  }
  const body = (await response.json().catch(() => null)) as {
    error?: { code?: string; upload?: UploadRecord };
  } | null;
  const code = body?.error?.code;
  throw new RideHistoryApiError(
    code && KNOWN_CODES.has(code) ? (code as RideHistoryApiErrorCode) : 'storage-error',
    body?.error?.upload ?? null,
  );
}

async function json<T>(response: Response): Promise<T> {
  if (!contentType(response).includes('application/json')) {
    throw new RideHistoryApiError('storage-unavailable');
  }
  return (await response.json()) as T;
}

export interface RideHistoryClient {
  /** The upload registry, newest first (BR-34). */
  listUploads(): Promise<UploadRecord[]>;
  /** Every stored ride as a ride bundle (BR-33). */
  fetchRides(): Promise<Uint8Array>;
  /**
   * Stores an upload's ride bundle (BR-16). Rejects with `duplicate-file` and the earlier upload
   * when the file was already imported (BR-37).
   */
  createUpload(bundle: Uint8Array): Promise<UploadRecord>;
}

export const rideHistoryClient: RideHistoryClient = {
  listUploads: async () =>
    (await json<{ uploads: UploadRecord[] }>(await request('/api/uploads'))).uploads,

  fetchRides: async () => {
    const response = await request('/api/rides');
    if (!contentType(response).includes('application/octet-stream')) {
      throw new RideHistoryApiError('storage-unavailable');
    }
    return new Uint8Array(await response.arrayBuffer());
  },

  createUpload: async (bundle) =>
    (
      await json<{ upload: UploadRecord }>(
        await request('/api/uploads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream', Accept: 'application/json' },
          body: bundle as Uint8Array<ArrayBuffer>,
        }),
      )
    ).upload,
};

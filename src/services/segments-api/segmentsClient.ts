import type {
  SegmentApiErrorCode,
  SegmentDetail,
  SegmentImportPayload,
  SegmentImportPlan,
  SegmentImportProblem,
  StoredSegment,
} from '@/types';

/*
 * Client for the local segment API (ADR-0009). Same origin only: it never talks to Strava or any
 * other host (BR-28, AC-29).
 */

const BASE = '/api/segments';

export class SegmentApiError extends Error {
  constructor(
    readonly code: SegmentApiErrorCode,
    readonly problems: readonly SegmentImportProblem[] = [],
  ) {
    super(code);
    this.name = 'SegmentApiError';
  }
}

const KNOWN_CODES: ReadonlySet<string> = new Set<SegmentApiErrorCode>([
  'invalid-json',
  'invalid-payload',
  'payload-too-large',
  'unsupported-media-type',
  'forbidden-origin',
  'not-found',
  'method-not-allowed',
  'storage-unavailable',
  'storage-error',
]);

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      ...init,
      credentials: 'same-origin',
      headers: { Accept: 'application/json', ...init.headers },
    });
  } catch {
    throw new SegmentApiError('storage-unavailable');
  }
  const isJson = (response.headers.get('content-type') ?? '').includes('application/json');
  if (response.ok) {
    if (response.status === 204) return undefined as T;
    if (!isJson) throw new SegmentApiError('storage-unavailable'); // e.g. a static file server
    return (await response.json()) as T;
  }
  if (!isJson) throw new SegmentApiError('storage-unavailable');
  const body = (await response.json().catch(() => null)) as {
    error?: { code?: string; problems?: SegmentImportProblem[] };
  } | null;
  const code = body?.error?.code;
  throw new SegmentApiError(
    code && KNOWN_CODES.has(code) ? (code as SegmentApiErrorCode) : 'storage-error',
    body?.error?.problems ?? [],
  );
}

const postJson = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export const segmentsClient = {
  list: async () => (await call<{ segments: StoredSegment[] }>('')).segments,
  get: async (segmentId: string) =>
    (await call<{ segment: SegmentDetail }>(`/${encodeURIComponent(segmentId)}`)).segment,
  preview: async (payload: SegmentImportPayload) =>
    (await call<{ plan: SegmentImportPlan }>('/preview', postJson(payload))).plan,
  import: async (payload: SegmentImportPayload) =>
    (await call<{ plan: SegmentImportPlan }>('/import', postJson(payload))).plan,
  remove: (segmentId: string) =>
    call<void>(`/${encodeURIComponent(segmentId)}`, { method: 'DELETE' }),
  removeAll: () => call<void>('', { method: 'DELETE' }),
};

export type SegmentsClient = typeof segmentsClient;

import { ID_PATTERN } from '../../src/features/segments/services/segmentRules';

/*
 * Optional Strava segment download (BRD v2.2 BR-31, ADR-0012). Used only by the
 * `npm run fetch-segments` command, never by the app: it downloads each segment's details and its
 * latlng / altitude / distance streams with the user's own access token, and returns an import
 * file in the existing JSON upload format (docs/segment-import-format.md). The token is sent only
 * to the Strava API, in the Authorization header, and never logged or written.
 */

export const STRAVA_API = 'https://www.strava.com/api/v3';
const STREAM_KEYS = 'latlng,altitude,distance';

export interface HttpResponse {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}
export type HttpGet = (
  url: string,
  init: { readonly headers: Readonly<Record<string, string>> },
) => Promise<HttpResponse>;

export interface SegmentFailure {
  readonly segmentId: string;
  readonly reason: string;
}

export interface FetchResult {
  /** Segment objects in the JSON upload format (Strava fields plus `streams`). */
  readonly segments: readonly Record<string, unknown>[];
  readonly failures: readonly SegmentFailure[];
  /** Why the download stopped before the last segment (bad token, rate limit), or null. */
  readonly stopped: string | null;
}

type Obj = Record<string, unknown>;
const isObject = (value: unknown): value is Obj =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Thrown for a response that ends the whole download. */
class StopError extends Error {}

/** A message for an HTTP status, without the response body (it may echo request details). */
function describeStatus(status: number): { stop: boolean; reason: string } {
  if (status === 401) {
    return {
      stop: true,
      reason:
        'Strava rejected the access token (401). It may have expired (tokens last 6 hours) or lack read access; get a new one at https://www.strava.com/settings/api.',
    };
  }
  if (status === 429) {
    return {
      stop: true,
      reason: 'Strava rate limit reached (429). Wait 15 minutes, then run the command again.',
    };
  }
  if (status === 404)
    return { stop: false, reason: 'not found on Strava, or not visible to you (404)' };
  if (status === 403) return { stop: false, reason: 'access denied by Strava (403)' };
  return { stop: false, reason: `Strava answered ${status}` };
}

async function getJson(url: string, token: string, get: HttpGet): Promise<unknown> {
  let response: HttpResponse;
  try {
    response = await get(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
  } catch {
    throw new Error('Strava could not be reached (network error)');
  }
  if (!response.ok) {
    const { stop, reason } = describeStatus(response.status);
    throw stop ? new StopError(reason) : new Error(reason);
  }
  try {
    return await response.json();
  } catch {
    throw new Error('Strava sent a response that is not JSON');
  }
}

/** The streams worth keeping, keyed by type, each `{ data: [...] }`; malformed ones are left out. */
function pickStreams(json: unknown): Obj | null {
  const streams: Obj = {};
  const entries = Array.isArray(json)
    ? json.filter(isObject).map((entry) => [entry.type, entry] as const)
    : isObject(json)
      ? Object.entries(json)
      : [];
  for (const [type, entry] of entries) {
    if (
      (type === 'latlng' || type === 'altitude' || type === 'distance') &&
      isObject(entry) &&
      Array.isArray(entry.data)
    ) {
      streams[type] = { data: entry.data };
    }
  }
  return Object.keys(streams).length > 0 ? streams : null;
}

/**
 * Downloads every segment in `segmentIds`, one after the other (BR-31). Each needs two requests:
 * the details and the streams. A missing or inaccessible segment is reported and skipped; an
 * invalid token or the rate limit stops the download, keeping what was fetched. Without streams,
 * a segment keeps its details (and Strava's summary polyline) only.
 */
// Implements: BR-31
export async function fetchStravaSegments(
  segmentIds: readonly string[],
  token: string,
  get: HttpGet,
  { pauseMs = 0, onProgress }: { pauseMs?: number; onProgress?: (message: string) => void } = {},
): Promise<FetchResult> {
  const segments: Obj[] = [];
  const failures: SegmentFailure[] = [];
  const pause = () => new Promise((resolve) => setTimeout(resolve, pauseMs));

  for (const [index, segmentId] of segmentIds.entries()) {
    if (index > 0 && pauseMs > 0) await pause();
    try {
      const detail = await getJson(`${STRAVA_API}/segments/${segmentId}`, token, get);
      if (!isObject(detail) || String(detail.id) !== segmentId || typeof detail.name !== 'string') {
        failures.push({ segmentId, reason: 'Strava sent segment details in an unexpected form' });
        continue;
      }
      let streams: Obj | null = null;
      try {
        streams = pickStreams(
          await getJson(
            `${STRAVA_API}/segments/${segmentId}/streams?keys=${STREAM_KEYS}&key_by_type=true`,
            token,
            get,
          ),
        );
      } catch (error) {
        if (error instanceof StopError) throw error;
        failures.push({
          segmentId,
          reason: `route streams unavailable: ${(error as Error).message}`,
        });
      }
      segments.push(streams ? { ...detail, streams } : { ...detail });
      onProgress?.(`${segmentId}: ${detail.name}${streams?.latlng ? '' : ' (no route streams)'}`);
    } catch (error) {
      if (error instanceof StopError) {
        return { segments, failures, stopped: error.message };
      }
      failures.push({ segmentId, reason: (error as Error).message });
    }
  }
  return { segments, failures, stopped: null };
}

/** The file to upload in the Segments tab: the JSON upload format with Strava field names. */
export function toImportFile(result: FetchResult): string {
  return `${JSON.stringify({ segments: result.segments }, null, 2)}\n`;
}

/**
 * Segment IDs listed in a catalog or upload file: `segments[].id` (or `segmentId`), or a bare list
 * of segments. Invalid IDs are left out; each ID appears once.
 */
export function segmentIdsFromFile(json: unknown): string[] {
  const list = Array.isArray(json) ? json : isObject(json) ? json.segments : null;
  if (!Array.isArray(list)) return [];
  const ids = list
    .filter(isObject)
    .map((entry) => String(entry.id ?? entry.segmentId ?? '').trim())
    .filter((id) => ID_PATTERN.test(id));
  return [...new Set(ids)];
}

export interface FetchArguments {
  readonly segmentIds: readonly string[];
  /** File to read segment IDs from, when none are given. */
  readonly from: string | null;
  readonly out: string | null;
  readonly errors: readonly string[];
}

/** `[ids…] [--from <file>] [--out <file>]`. */
export function parseFetchArguments(argv: readonly string[]): FetchArguments {
  const segmentIds: string[] = [];
  const errors: string[] = [];
  let from: string | null = null;
  let out: string | null = null;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? '';
    if (arg === '--from' || arg === '--out') {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) {
        errors.push(`${arg} needs a file path.`);
      } else if (arg === '--from') {
        from = value;
      } else {
        out = value;
      }
      i += 1;
    } else if (ID_PATTERN.test(arg)) {
      if (!segmentIds.includes(arg)) segmentIds.push(arg);
    } else {
      errors.push(`"${arg}" is not a Strava segment ID.`);
    }
  }
  return { segmentIds, from, out, errors };
}

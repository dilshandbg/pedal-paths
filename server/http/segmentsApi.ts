import type { IncomingMessage, ServerResponse } from 'node:http';
import type { SegmentApiErrorCode } from '../../src/types/segment';
import { ID_PATTERN } from '../../src/features/segments/services/segmentRules';
import type { SegmentRepository } from '../segments/segmentRepository';

/*
 * Same-origin JSON API for imported segments (ADR-0009, docs/implementation-plan-v2.md §2).
 * Connect-style middleware: the Vite dev and preview servers mount it. It never calls any external
 * service (BR-28) and errors never expose internals (NFR-08).
 */

export const API_PREFIX = '/api/segments';

/** Largest accepted request body. A 20 MB file grows when its routes are expanded to JSON. */
export const MAX_BODY_BYTES = 64 * 1024 * 1024;

/** Error codes in responses (`{ error: { code } }`). Shared with the browser client. */
export type ApiErrorCode = SegmentApiErrorCode;

type Next = (error?: unknown) => void;

class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(code);
  }
}

function send(res: ServerResponse, status: number, body?: unknown): void {
  res.statusCode = status;
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (body === undefined) {
    res.end();
    return;
  }
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

/**
 * Whether a peer address is this machine. Segment data is served to the local machine only
 * (NFR-07), even if the dev server is started with `--host`.
 */
export function isLoopbackAddress(address: string | undefined): boolean {
  if (!address) return false;
  const ip = address.startsWith('::ffff:') ? address.slice(7) : address;
  return ip === '::1' || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip);
}

/** Rejects requests a different site's page could send (CSRF, NFR-08). */
function checkOrigin(req: IncomingMessage): void {
  if (req.headers['sec-fetch-site'] === 'cross-site') {
    throw new ApiError(403, 'forbidden-origin');
  }
  const origin = req.headers.origin;
  if (origin === undefined) return;
  let host: string;
  try {
    host = new URL(origin).host;
  } catch {
    throw new ApiError(403, 'forbidden-origin');
  }
  if (host !== req.headers.host) {
    throw new ApiError(403, 'forbidden-origin');
  }
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const type = req.headers['content-type'] ?? '';
  if (!/^application\/json\s*(;|$)/i.test(type)) {
    throw new ApiError(415, 'unsupported-media-type');
  }
  if (Number(req.headers['content-length'] ?? 0) > MAX_BODY_BYTES) {
    throw new ApiError(413, 'payload-too-large');
  }
  const chunks: Buffer[] = [];
  let size = 0;
  let tooLarge = false;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) tooLarge = true; // keep draining so the response can be sent
    if (!tooLarge) chunks.push(chunk);
  }
  if (tooLarge) throw new ApiError(413, 'payload-too-large');
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new ApiError(400, 'invalid-json');
  }
}

/**
 * Creates the `/api/segments` middleware. `getRepository` opens storage on first use; when it
 * fails, requests answer 503 `storage-unavailable` instead of breaking the app.
 */
// Implements: BR-23, BR-24, BR-25, BR-27, NFR-07, NFR-08
export function createSegmentsApi(getRepository: () => SegmentRepository) {
  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const rest = url.pathname.slice(API_PREFIX.length).replace(/\/$/, '');
    const method = req.method ?? 'GET';
    if (!isLoopbackAddress(req.socket.remoteAddress)) {
      throw new ApiError(403, 'forbidden-origin');
    }
    checkOrigin(req);

    let repository: SegmentRepository;
    try {
      repository = getRepository();
    } catch (error) {
      console.error('Segment storage could not be opened:', (error as Error).message);
      throw new ApiError(503, 'storage-unavailable');
    }

    if (rest === '') {
      if (method === 'GET') return send(res, 200, { segments: repository.list() });
      if (method === 'DELETE') {
        repository.removeAll();
        return send(res, 204);
      }
      throw new ApiError(405, 'method-not-allowed');
    }
    if (rest === '/preview' || rest === '/import') {
      if (method !== 'POST') throw new ApiError(405, 'method-not-allowed');
      const body = await readJson(req);
      const result =
        rest === '/preview' ? repository.preview(body) : repository.importPayload(body);
      if (!result.ok) throw new ApiError(400, 'invalid-payload', { problems: result.problems });
      return send(res, 200, { plan: result.plan });
    }
    const id = /^\/([^/]+)$/.exec(rest)?.[1];
    if (id === undefined || !ID_PATTERN.test(id)) throw new ApiError(404, 'not-found');
    if (method === 'GET') {
      const segment = repository.get(id);
      if (!segment) throw new ApiError(404, 'not-found');
      return send(res, 200, { segment });
    }
    if (method === 'DELETE') {
      if (!repository.remove(id)) throw new ApiError(404, 'not-found');
      return send(res, 204);
    }
    throw new ApiError(405, 'method-not-allowed');
  }

  return (req: IncomingMessage, res: ServerResponse, next: Next): void => {
    const path = (req.url ?? '').split('?')[0] ?? '';
    if (path !== API_PREFIX && !path.startsWith(`${API_PREFIX}/`)) {
      next();
      return;
    }
    handle(req, res).catch((error: unknown) => {
      if (error instanceof ApiError) {
        send(res, error.status, { error: { code: error.code, ...error.extra } });
        return;
      }
      console.error('Segment API request failed:', (error as Error).message);
      send(res, 500, { error: { code: 'storage-error' } });
    });
  };
}

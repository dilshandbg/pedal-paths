import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AssistantErrorCode } from '../../src/types/assistant';
import type { RideHistoryApiErrorCode } from '../../src/types/rideHistory';

/*
 * Shared plumbing of the local JSON APIs (ADR-0009, ADR-0013): loopback-only access and origin
 * checks (NFR-07, NFR-08), bounded request bodies, and error responses without internal details.
 */

/** Every error code a local API answers with (`{ error: { code } }`). */
export type ApiErrorCode = RideHistoryApiErrorCode | AssistantErrorCode;

export type Next = (error?: unknown) => void;
export type Middleware = (req: IncomingMessage, res: ServerResponse, next: Next) => void;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(code);
  }
}

function setCommonHeaders(res: ServerResponse, status: number): void {
  res.statusCode = status;
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

export function send(res: ServerResponse, status: number, body?: unknown): void {
  setCommonHeaders(res, status);
  if (body === undefined) {
    res.end();
    return;
  }
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

export function sendBinary(res: ServerResponse, status: number, body: Uint8Array): void {
  setCommonHeaders(res, status);
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Length', String(body.byteLength));
  res.end(body);
}

/**
 * Whether a peer address is this machine. Local data is served to the local machine only
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

/** Throws unless the request comes from this machine and from the app's own origin. */
export function checkLocalRequest(req: IncomingMessage): void {
  if (!isLoopbackAddress(req.socket.remoteAddress)) {
    throw new ApiError(403, 'forbidden-origin');
  }
  checkOrigin(req);
}

async function readBody(req: IncomingMessage, contentType: RegExp, maxBytes: number) {
  if (!contentType.test(req.headers['content-type'] ?? '')) {
    throw new ApiError(415, 'unsupported-media-type');
  }
  if (Number(req.headers['content-length'] ?? 0) > maxBytes) {
    throw new ApiError(413, 'payload-too-large');
  }
  const chunks: Buffer[] = [];
  let size = 0;
  let tooLarge = false;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > maxBytes) tooLarge = true; // keep draining so the response can be sent
    if (!tooLarge) chunks.push(chunk);
  }
  if (tooLarge) throw new ApiError(413, 'payload-too-large');
  return Buffer.concat(chunks);
}

export async function readJson(req: IncomingMessage, maxBytes: number): Promise<unknown> {
  const body = await readBody(req, /^application\/json\s*(;|$)/i, maxBytes);
  try {
    return JSON.parse(body.toString('utf8'));
  } catch {
    throw new ApiError(400, 'invalid-json');
  }
}

export async function readBinary(req: IncomingMessage, maxBytes: number): Promise<Uint8Array> {
  const body = await readBody(req, /^application\/octet-stream\s*(;|$)/i, maxBytes);
  return new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
}

/** The part of the path after `prefix`, without a trailing slash; null when not under `prefix`. */
export function pathUnder(url: URL, prefix: string): string | null {
  const { pathname } = url;
  if (pathname !== prefix && !pathname.startsWith(`${prefix}/`)) return null;
  return pathname.slice(prefix.length).replace(/\/$/, '');
}

/**
 * Connect-style middleware for the paths under `prefixes`: other requests go to `next`. An
 * {@link ApiError} becomes its response; anything else is logged and answered with a bare
 * `storage-error` (NFR-08).
 */
export function apiMiddleware(
  prefixes: readonly string[],
  label: string,
  handle: (req: IncomingMessage, res: ServerResponse) => Promise<void>,
): Middleware {
  return (req, res, next) => {
    const path = (req.url ?? '').split('?')[0] ?? '';
    if (!prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
      next();
      return;
    }
    handle(req, res).catch((error: unknown) => {
      if (error instanceof ApiError) {
        send(res, error.status, { error: { code: error.code, ...error.extra } });
        return;
      }
      console.error(`${label} request failed:`, (error as Error).message);
      send(res, 500, { error: { code: 'storage-error' } });
    });
  };
}

import type { IncomingMessage, ServerResponse } from 'node:http';
import { encodeRideBundle } from '../../src/services/ride-history/rideBundle';
import type { RideRepository } from '../rides/rideRepository';
import { validateUploadBundle } from '../rides/validateUpload';
import {
  ApiError,
  apiMiddleware,
  checkLocalRequest,
  pathUnder,
  readBinary,
  readJson,
  send,
  sendBinary,
  type Middleware,
} from './apiSupport';

/*
 * Same-origin API of the ride history and upload registry (ADR-0013 §4, §6). Mounted by the Vite
 * dev and preview servers next to the segment API, with the same local-only checks (NFR-07,
 * NFR-08). It never calls any external service.
 *
 *   GET    /api/uploads              registry, newest first                    200 { uploads }
 *   GET    /api/uploads?hash=<hex>   imported upload of that file, or null      200 { upload }
 *   POST   /api/uploads              ride bundle (octet-stream)                 201 { upload } · 400 · 409
 *   POST   /api/uploads/delete       { uploadIds: [...] }                       200 counts · 404
 *   DELETE /api/uploads              everything                                 200 counts
 *   GET    /api/rides                every stored ride, as a ride bundle        200 octet-stream
 */

export const UPLOADS_PREFIX = '/api/uploads';
export const RIDES_PREFIX = '/api/rides';

/**
 * Largest accepted upload body. Tracks take 20 bytes per point, so this holds about 50 million
 * points: far more than a personal export, while still bounding memory (NFR-08).
 */
export const MAX_UPLOAD_BYTES = 1024 * 1024 * 1024;
const MAX_DELETE_BODY_BYTES = 256 * 1024;
const MAX_DELETE_IDS = 1000;

const SHA256_HEX = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function readUploadIds(body: unknown): string[] {
  const ids =
    typeof body === 'object' && body !== null && !Array.isArray(body)
      ? (body as { uploadIds?: unknown }).uploadIds
      : undefined;
  if (
    !Array.isArray(ids) ||
    ids.length === 0 ||
    ids.length > MAX_DELETE_IDS ||
    !ids.every((id): id is string => typeof id === 'string' && UUID.test(id))
  ) {
    throw new ApiError(400, 'invalid-payload', {
      problems: [`uploadIds must list 1–${MAX_DELETE_IDS} upload IDs.`],
    });
  }
  return ids;
}

/**
 * Creates the `/api/uploads` and `/api/rides` middleware. `getRepository` opens storage on first
 * use; when it fails, requests answer 503 `storage-unavailable` and nothing is imported.
 */
// Implements: BR-16, BR-33, BR-34, BR-36, BR-37, NFR-07, NFR-08
export function createRidesApi(getRepository: () => RideRepository): Middleware {
  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const method = req.method ?? 'GET';
    checkLocalRequest(req);

    let repository: RideRepository;
    try {
      repository = getRepository();
    } catch (error) {
      console.error('Ride storage could not be opened:', (error as Error).message);
      throw new ApiError(503, 'storage-unavailable');
    }

    const rides = pathUnder(url, RIDES_PREFIX);
    if (rides !== null) {
      if (rides !== '') throw new ApiError(404, 'not-found');
      if (method !== 'GET') throw new ApiError(405, 'method-not-allowed');
      const stored = repository.listRides();
      return sendBinary(res, 200, encodeRideBundle({ rideCount: stored.length }, stored));
    }

    const uploads = pathUnder(url, UPLOADS_PREFIX) ?? '';
    if (uploads === '') {
      if (method === 'GET') {
        const hash = url.searchParams.get('hash');
        if (hash === null) return send(res, 200, { uploads: repository.listUploads() });
        if (!SHA256_HEX.test(hash)) {
          throw new ApiError(400, 'invalid-payload', { problems: ['hash must be a SHA-256.'] });
        }
        return send(res, 200, { upload: repository.findImportedUpload(hash) });
      }
      if (method === 'POST') {
        const validation = validateUploadBundle(await readBinary(req, MAX_UPLOAD_BYTES));
        if (!validation.ok) {
          throw new ApiError(400, 'invalid-payload', { problems: validation.problems });
        }
        const result = repository.importUpload(validation.value);
        if (!result.ok) throw new ApiError(409, 'duplicate-file', { upload: result.existing });
        return send(res, 201, { upload: result.upload });
      }
      if (method === 'DELETE') {
        return send(res, 200, repository.deleteAll());
      }
      throw new ApiError(405, 'method-not-allowed');
    }
    if (uploads === '/delete') {
      if (method !== 'POST') throw new ApiError(405, 'method-not-allowed');
      const ids = readUploadIds(await readJson(req, MAX_DELETE_BODY_BYTES));
      const result = repository.deleteUploads(ids);
      if (!result.ok) throw new ApiError(404, 'not-found', { missing: result.missing });
      return send(res, 200, {
        deletedUploads: result.deletedUploads,
        deletedRides: result.deletedRides,
      });
    }
    throw new ApiError(404, 'not-found');
  }

  return apiMiddleware([UPLOADS_PREFIX, RIDES_PREFIX], 'Ride API', handle);
}

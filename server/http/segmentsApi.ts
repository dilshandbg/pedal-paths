import type { IncomingMessage, ServerResponse } from 'node:http';
import { ID_PATTERN } from '../../src/features/segments/services/segmentRules';
import type { SegmentRepository } from '../segments/repository';
import {
  ApiError,
  apiMiddleware,
  checkLocalRequest,
  pathUnder,
  readJson,
  send,
  type Middleware,
} from './apiSupport';

export { isLoopbackAddress } from './apiSupport';

/*
 * Same-origin JSON API for imported segments (ADR-0009, docs/implementation-plan-v2.md §2).
 * Connect-style middleware: the Vite dev and preview servers mount it. It never calls any external
 * service (BR-28) and errors never expose internals (NFR-08).
 */

export const API_PREFIX = '/api/segments';

/** Largest accepted request body. A 20 MB file grows when its routes are expanded to JSON. */
export const MAX_BODY_BYTES = 64 * 1024 * 1024;

/**
 * Creates the `/api/segments` middleware. `getRepository` opens storage on first use; when it
 * fails, requests answer 503 `storage-unavailable` instead of breaking the app.
 */
// Implements: BR-23, BR-24, BR-25, BR-27, NFR-07, NFR-08
export function createSegmentsApi(getRepository: () => SegmentRepository): Middleware {
  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const rest = pathUnder(url, API_PREFIX) ?? '';
    const method = req.method ?? 'GET';
    checkLocalRequest(req);

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
      const body = await readJson(req, MAX_BODY_BYTES);
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

  return apiMiddleware([API_PREFIX], 'Segment API', handle);
}

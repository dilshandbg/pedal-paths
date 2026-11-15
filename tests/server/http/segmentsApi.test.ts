// @vitest-environment node
import { createServer, request, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDatabase } from '../../../server/db/database';
import { createSegmentsApi, MAX_BODY_BYTES } from '../../../server/http/segmentsApi';
import {
  createSegmentRepository,
  type SegmentRepository,
} from '../../../server/segments/segmentRepository';
import { effort, payload, segment } from '../fixtures';

let server: Server;
let base: string;
let repository: SegmentRepository;

async function start(getRepository: () => SegmentRepository) {
  const api = createSegmentsApi(getRepository);
  server = createServer((req, res) =>
    api(req, res, () => {
      res.statusCode = 418; // "not handled": the next middleware
      res.end();
    }),
  );
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

beforeEach(async () => {
  repository = createSegmentRepository(openDatabase(':memory:'));
  await start(() => repository);
});
afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
  repository.close();
});

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

describe('BR-22 / BR-23: preview and import endpoints', () => {
  it('previews without storing, then imports', async () => {
    const body = payload([segment()], [effort()]);

    const preview = await post('/api/segments/preview', body);
    expect(preview.status).toBe(200);
    expect((await preview.json()).plan.counts).toEqual({ new: 1, update: 0, unchanged: 0 });
    expect(repository.list()).toEqual([]);

    const imported = await post('/api/segments/import', body);
    expect(imported.status).toBe(200);
    expect((await imported.json()).plan.items[0]).toMatchObject({
      segmentId: '1001',
      status: 'new',
    });

    const list = await fetch(`${base}/api/segments`);
    expect(list.status).toBe(200);
    expect(list.headers.get('cache-control')).toBe('no-store');
    expect((await list.json()).segments.map((s: { segmentId: string }) => s.segmentId)).toEqual([
      '1001',
    ]);
  });

  it('AC-21: answers 400 with every problem for an invalid payload', async () => {
    const response = await post('/api/segments/import', payload([segment({ distanceM: -1 })]));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: 'invalid-payload',
        problems: [{ location: 'segment 1', field: 'distanceM', message: expect.any(String) }],
      },
    });
    expect(repository.list()).toEqual([]);
  });

  it('answers 400 for malformed JSON', async () => {
    const response = await post('/api/segments/preview', '{"segments": [');
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('invalid-json');
  });
});

describe('BR-25 / BR-26: reading segments', () => {
  it('returns one segment with its efforts, or 404', async () => {
    repository.importPayload(payload([segment()], [effort()]));

    const found = await fetch(`${base}/api/segments/1001`);
    expect(found.status).toBe(200);
    const { segment: detail } = await found.json();
    expect(detail.efforts).toHaveLength(1);
    expect(detail.efforts[0].isPersonalBest).toBe(true);

    expect((await fetch(`${base}/api/segments/999`)).status).toBe(404);
    expect((await fetch(`${base}/api/segments/not-an-id`)).status).toBe(404);
    expect((await fetch(`${base}/api/segments/1/2`)).status).toBe(404);
  });
});

describe('BR-27 / AC-27: removing segments', () => {
  it('removes one segment, then all', async () => {
    repository.importPayload(payload([segment(), segment({ segmentId: '2' })]));

    const one = await fetch(`${base}/api/segments/1001`, { method: 'DELETE' });
    expect(one.status).toBe(204);
    expect((await fetch(`${base}/api/segments/1001`, { method: 'DELETE' })).status).toBe(404);

    const all = await fetch(`${base}/api/segments`, { method: 'DELETE' });
    expect(all.status).toBe(204);
    expect(repository.list()).toEqual([]);
  });
});

describe('NFR-08: request checks', () => {
  it('requires a JSON content type for imports', async () => {
    const response = await fetch(`${base}/api/segments/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(payload([segment()])),
    });
    expect(response.status).toBe(415);
    expect(repository.list()).toEqual([]);
  });

  it('rejects requests from another site', async () => {
    const foreign = await post('/api/segments/import', payload([segment()]), {
      Origin: 'https://evil.example',
    });
    expect(foreign.status).toBe(403);
    expect((await foreign.json()).error.code).toBe('forbidden-origin');

    const crossSite = await fetch(`${base}/api/segments`, {
      method: 'DELETE',
      headers: { 'Sec-Fetch-Site': 'cross-site' },
    });
    expect(crossSite.status).toBe(403);

    const sameOrigin = await post('/api/segments/import', payload([segment()]), { Origin: base });
    expect(sameOrigin.status).toBe(200);
  });

  it('rejects a body over the size limit', async () => {
    const status = await new Promise<number>((resolve, reject) => {
      const req = request(`${base}/api/segments/import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': String(MAX_BODY_BYTES + 1),
        },
      });
      req.on('response', (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      });
      req.on('error', reject);
      req.end();
    });
    expect(status).toBe(413);
  });

  it('answers 405 for an unsupported method', async () => {
    expect((await fetch(`${base}/api/segments/import`)).status).toBe(405);
    expect((await fetch(`${base}/api/segments`, { method: 'PUT' })).status).toBe(405);
  });

  it('passes other paths to the next middleware', async () => {
    expect((await fetch(`${base}/index.html`)).status).toBe(418);
    expect((await fetch(`${base}/api/segmentsx`)).status).toBe(418);
  });
});

describe('storage failures', () => {
  it('answers 503 when the database cannot be opened, without internals', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await new Promise((resolve) => server.close(resolve));
    await start(() => {
      throw new Error('SQLITE_CANTOPEN C:\\secret\\path');
    });

    const response = await fetch(`${base}/api/segments`);
    expect(response.status).toBe(503);
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ error: { code: 'storage-unavailable' } });
    expect(text).not.toMatch(/secret/);
  });

  it('answers 500 for an unexpected storage error, without internals', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(repository, 'list').mockImplementation(() => {
      throw new Error('disk I/O error at /secret');
    });
    const response = await fetch(`${base}/api/segments`);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: { code: 'storage-error' } });
  });
});

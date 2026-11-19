// @vitest-environment node
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decodeRideBundle } from '../../../src/services/ride-history/rideBundle';
import { decodeTrack } from '../../../src/services/ride-history/trackCodec';
import type { UploadRecord } from '../../../src/types/rideHistory';
import { createRidesApi, MAX_UPLOAD_BYTES } from '../../../server/http/ridesApi';
import { openRideRepository, type RideRepository } from '../../../server/rides/rideRepository';
import { hash, ride, track, upload, uploadBody } from '../rideFixtures';

let server: Server;
let base: string;
let repository: RideRepository;

async function start(getRepository: () => RideRepository) {
  const api = createRidesApi(getRepository);
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
  repository = openRideRepository(':memory:');
  await start(() => repository);
});
afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
  repository.close();
});

const postUpload = (body: Uint8Array, headers: Record<string, string> = {}) =>
  fetch(`${base}/api/uploads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream', ...headers },
    body,
  });

const postJson = (path: string, body: unknown) =>
  fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

async function uploaded(n: number, rides = [ride(String(n))]): Promise<UploadRecord> {
  const response = await postUpload(uploadBody(upload(n, rides)));
  expect(response.status).toBe(201);
  return ((await response.json()) as { upload: UploadRecord }).upload;
}

async function storedRides() {
  const response = await fetch(`${base}/api/rides`);
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toBe('application/octet-stream');
  return decodeRideBundle(new Uint8Array(await response.arrayBuffer()));
}

describe('BR-33 / BR-34: upload and restore endpoints', () => {
  it('stores an upload and returns its registry entry', async () => {
    const record = await uploaded(1, [ride('1'), ride('2')]);

    expect(record).toMatchObject({ fileName: 'export_1.zip', rideCount: 2, status: 'complete' });
    const list = await (await fetch(`${base}/api/uploads`)).json();
    expect(list).toEqual({ uploads: [record] });
  });

  it('AC-34: returns every stored ride with its track as a ride bundle', async () => {
    const points = track(51.5, -0.12, 6);
    await uploaded(1, [ride('1', {}, points)]);
    await uploaded(2, [ride('1'), ride('2')]);

    const bundle = await storedRides();

    expect(bundle.meta).toEqual({ rideCount: 2 });
    expect(bundle.rides.map((r) => (r.details as { activityId: string }).activityId)).toEqual([
      '1',
      '2',
    ]);
    expect(decodeTrack(bundle.rides[0]!.track)).toEqual(points); // ! safe: two rides asserted above
  });

  it('returns an empty bundle when nothing is stored', async () => {
    expect((await storedRides()).rides).toEqual([]);
  });

  it('rejects an invalid upload with its problems, storing nothing', async () => {
    const response = await postUpload(uploadBody(upload(1, [ride('1', { distanceKm: -5 })])));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: 'invalid-payload',
        problems: ['rides[0].distanceKm must be null or a number ≥ 0.'],
      },
    });
    expect(repository.listUploads()).toEqual([]);
  });

  it('requires a binary body', async () => {
    const response = await postJson('/api/uploads', {});

    expect(response.status).toBe(415);
  });

  it('rejects a body larger than the limit before reading it', async () => {
    const response = await postUpload(new Uint8Array(8), {
      'Content-Length': String(MAX_UPLOAD_BYTES + 1),
    }).catch(() => null);

    // The server answers 413 from the header; some clients see the connection close instead.
    if (response) expect(response.status).toBe(413);
    expect(repository.listUploads()).toEqual([]);
  });
});

describe('BR-37: duplicate file endpoints', () => {
  it('AC-41: answers 409 with the earlier upload for the same file', async () => {
    const first = await uploaded(1);

    const again = await postUpload(uploadBody(upload(1, [ride('9')])));

    expect(again.status).toBe(409);
    expect(await again.json()).toEqual({ error: { code: 'duplicate-file', upload: first } });
    expect(repository.listUploads()).toHaveLength(1);
  });

  it('looks up an imported file by hash before uploading', async () => {
    const first = await uploaded(1);

    const found = await (await fetch(`${base}/api/uploads?hash=${hash(1)}`)).json();
    const other = await (await fetch(`${base}/api/uploads?hash=${hash(2)}`)).json();
    const invalid = await fetch(`${base}/api/uploads?hash=nope`);

    expect(found).toEqual({ upload: first });
    expect(other).toEqual({ upload: null });
    expect(invalid.status).toBe(400);
  });
});

describe('BR-36: deletion endpoints', () => {
  it('AC-37 / AC-38: deletes selected uploads and the rides only they contained', async () => {
    const a = await uploaded(1, [ride('1'), ride('2')]);
    const b = await uploaded(2, [ride('3')]);
    await uploaded(3, [ride('2'), ride('4')]);

    const response = await postJson('/api/uploads/delete', { uploadIds: [a.uploadId, b.uploadId] });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deletedUploads: 2, deletedRides: 2 });
    expect(
      (await storedRides()).rides.map((r) => (r.details as { activityId: string }).activityId),
    ).toEqual(['2', '4']);
  });

  it('answers 404 and deletes nothing when an ID is unknown', async () => {
    const a = await uploaded(1);
    const unknown = '00000000-0000-4000-8000-000000000000';

    const response = await postJson('/api/uploads/delete', { uploadIds: [a.uploadId, unknown] });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: { code: 'not-found', missing: [unknown] } });
    expect(repository.listUploads()).toHaveLength(1);
  });

  it('rejects a malformed deletion request', async () => {
    for (const body of [{}, { uploadIds: [] }, { uploadIds: ['not-a-uuid'] }, { uploadIds: 'x' }]) {
      const response = await postJson('/api/uploads/delete', body);
      expect(response.status).toBe(400);
    }
  });

  it('AC-39: DELETE removes every upload and ride', async () => {
    await uploaded(1, [ride('1'), ride('2')]);
    await uploaded(2, [ride('2')]);

    const response = await fetch(`${base}/api/uploads`, { method: 'DELETE' });

    expect(await response.json()).toEqual({ deletedUploads: 2, deletedRides: 2 });
    expect((await storedRides()).rides).toEqual([]);
  });
});

describe('NFR-07 / NFR-08: local-only, robust API', () => {
  it('passes other paths to the next middleware', async () => {
    expect((await fetch(`${base}/api/segments`)).status).toBe(418);
    expect((await fetch(`${base}/api/uploadsX`)).status).toBe(418);
  });

  it('answers unknown paths and methods', async () => {
    expect((await fetch(`${base}/api/uploads/123`)).status).toBe(404);
    expect((await fetch(`${base}/api/rides/1`)).status).toBe(404);
    expect((await fetch(`${base}/api/rides`, { method: 'DELETE' })).status).toBe(405);
    expect((await fetch(`${base}/api/uploads`, { method: 'PUT' })).status).toBe(405);
    expect((await fetch(`${base}/api/uploads/delete`)).status).toBe(405);
  });

  it('rejects cross-site requests', async () => {
    const response = await fetch(`${base}/api/uploads`, {
      headers: { Origin: 'https://example.com' },
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: { code: 'forbidden-origin' } });
  });

  it('answers 503 when storage cannot be opened, without internal details', async () => {
    await new Promise((resolve) => server.close(resolve));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    await start(() => {
      throw new Error('disk on fire at C:\\secret');
    });

    const response = await fetch(`${base}/api/uploads`);

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: { code: 'storage-unavailable' } });
    expect(error).toHaveBeenCalled();
  });

  it('answers 500 without details when storage fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(repository, 'listUploads').mockImplementation(() => {
      throw new Error('SQLITE_CORRUPT at C:\\secret');
    });

    const response = await fetch(`${base}/api/uploads`);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: { code: 'storage-error' } });
    expect(error).toHaveBeenCalledWith('Ride API request failed:', 'SQLITE_CORRUPT at C:\\secret');
  });
});

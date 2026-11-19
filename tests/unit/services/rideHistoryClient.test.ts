import { describe, expect, it, vi } from 'vitest';
import {
  RideHistoryApiError,
  rideHistoryClient,
} from '@/services/ride-history-api/rideHistoryClient';
import type { UploadRecord } from '@/types';

const record: UploadRecord = {
  uploadId: '00000000-0000-4000-8000-000000000001',
  fileName: 'export.zip',
  fileSizeBytes: 10,
  fileHash: 'a'.repeat(64),
  uploadedAt: '2026-11-19T10:00:00.000Z',
  status: 'complete',
  rideCount: 2,
  newRideCount: 2,
  totalDistanceKm: 20,
  skippedCount: 0,
  excludedNonRideCount: 0,
};

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });

function stubFetch(response: Response | Error) {
  const fetchMock = vi.fn(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function rejection(promise: Promise<unknown>): Promise<RideHistoryApiError> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  if (!(error instanceof RideHistoryApiError)) throw new Error('expected a RideHistoryApiError');
  return error;
}

describe('BR-33 / BR-34: ride history API client', () => {
  it('lists the upload registry from the same origin', async () => {
    const fetchMock = stubFetch(jsonResponse(200, { uploads: [record] }));

    expect(await rideHistoryClient.listUploads()).toEqual([record]);
    expect(fetchMock).toHaveBeenCalledWith('/api/uploads', { credentials: 'same-origin' });
  });

  it('fetches the stored rides as bytes', async () => {
    stubFetch(
      new Response(new Uint8Array([1, 2, 3]), {
        headers: { 'Content-Type': 'application/octet-stream' },
      }),
    );

    expect([...(await rideHistoryClient.fetchRides())]).toEqual([1, 2, 3]);
  });

  it('posts an upload bundle as binary and returns the registry entry', async () => {
    const fetchMock = stubFetch(jsonResponse(201, { upload: record }));
    const bundle = new Uint8Array([5, 6]);

    expect(await rideHistoryClient.createUpload(bundle)).toEqual(record);
    expect(fetchMock).toHaveBeenCalledWith('/api/uploads', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/octet-stream', Accept: 'application/json' },
      body: bundle,
    });
  });

  it('AC-41: reports a duplicate file with the earlier upload', async () => {
    stubFetch(jsonResponse(409, { error: { code: 'duplicate-file', upload: record } }));

    const error = await rejection(rideHistoryClient.createUpload(new Uint8Array()));

    expect(error.code).toBe('duplicate-file');
    expect(error.existingUpload).toEqual(record);
  });

  it('treats a network failure or a non-API answer as unavailable storage', async () => {
    stubFetch(new TypeError('Failed to fetch'));
    expect((await rejection(rideHistoryClient.listUploads())).code).toBe('storage-unavailable');

    stubFetch(new Response('<html>', { status: 200, headers: { 'Content-Type': 'text/html' } }));
    expect((await rejection(rideHistoryClient.listUploads())).code).toBe('storage-unavailable');
    stubFetch(new Response('<html>', { status: 200, headers: { 'Content-Type': 'text/html' } }));
    expect((await rejection(rideHistoryClient.fetchRides())).code).toBe('storage-unavailable');

    stubFetch(
      new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain' } }),
    );
    expect((await rejection(rideHistoryClient.listUploads())).code).toBe('storage-unavailable');
  });

  it('BR-36: deletes selected uploads with their IDs', async () => {
    const fetchMock = stubFetch(jsonResponse(200, { deletedUploads: 2, deletedRides: 3 }));

    expect(await rideHistoryClient.deleteUploads(['a', 'b'])).toEqual({
      deletedUploads: 2,
      deletedRides: 3,
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/uploads/delete', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ uploadIds: ['a', 'b'] }),
    });
  });

  it('AC-39: deletes everything', async () => {
    const fetchMock = stubFetch(jsonResponse(200, { deletedUploads: 1, deletedRides: 1 }));

    expect(await rideHistoryClient.deleteAll()).toEqual({ deletedUploads: 1, deletedRides: 1 });
    expect(fetchMock).toHaveBeenCalledWith('/api/uploads', {
      method: 'DELETE',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });
  });

  it('reports a deletion of an upload that no longer exists', async () => {
    stubFetch(jsonResponse(404, { error: { code: 'not-found', missing: ['a'] } }));

    expect((await rejection(rideHistoryClient.deleteUploads(['a']))).code).toBe('not-found');
  });

  it('maps unknown error codes to a generic storage error', async () => {
    stubFetch(jsonResponse(500, { error: { code: 'something-new' } }));

    expect((await rejection(rideHistoryClient.listUploads())).code).toBe('storage-error');
  });
});

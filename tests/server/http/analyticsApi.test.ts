// @vitest-environment node
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRideAnalytics, type RideAnalytics } from '../../../server/analytics/rideAnalytics';
import { createAnalyticsApi } from '../../../server/http/analyticsApi';
import { openRideRepository, type RideRepository } from '../../../server/rides/rideRepository';
import { ride, track, upload } from '../rideFixtures';

let server: Server;
let base: string;
let repository: RideRepository;

async function start(getAnalytics: () => RideAnalytics) {
  const api = createAnalyticsApi(getAnalytics);
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
  repository.importUpload(
    upload(1, [
      ride('1', { activityDate: '2024-01-10T08:00:00.000Z', distanceKm: 12 }, track(51.5, -0.12)),
      ride('2', { activityDate: '2024-02-10T08:00:00.000Z', distanceKm: 8 }, track(51.5, -0.12)),
    ]),
  );
  const analytics = createRideAnalytics(repository, 'UTC');
  await start(() => analytics);
});
afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
  repository.close();
});

const get = async (path: string) => {
  const response = await fetch(`${base}${path}`);
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
};

describe('BR-38: analytics API', () => {
  it('lists its functions and their parameters', async () => {
    const { status, body } = await get('/api/analytics');

    expect(status).toBe(200);
    expect((body.functions as { name: string }[]).map((f) => f.name)).toEqual([
      'distance-by-month',
      'distance-by-year',
      'location-visits',
      'route-frequency',
      'compare-periods',
    ]);
  });

  it('answers each function from the stored history', async () => {
    expect((await get('/api/analytics/distance-by-month?from=2024-02-01')).body).toEqual({
      result: [
        {
          year: 2024,
          month: 2,
          rideCount: 1,
          distanceKm: 8,
          elevationGainM: 50,
          movingTimeS: 1800,
          ridesWithoutDistance: 0,
        },
      ],
    });
    expect((await get('/api/analytics/distance-by-year')).body.result).toEqual([
      expect.objectContaining({ year: 2024, rideCount: 2, distanceKm: 20 }),
    ]);
    expect(
      (
        (await get('/api/analytics/location-visits?lat=51.5&lng=-0.12')).body.result as {
          visitCount: number;
        }
      ).visitCount,
    ).toBe(2);
    expect(
      (
        (await get('/api/analytics/route-frequency?south=51.49&west=-0.13&north=51.51&east=-0.11'))
          .body.result as { rideCount: number }[]
      )[0]?.rideCount,
    ).toBe(2);
    expect(
      (
        await get(
          '/api/analytics/compare-periods?metric=rideCount&aFrom=2024-01-01&aTo=2024-01-31&bFrom=2024-02-01&bTo=2024-02-29',
        )
      ).body.result,
    ).toMatchObject({ periodA: { value: 1 }, periodB: { value: 1 }, difference: 0 });
  });

  it('rejects invalid parameters with every problem', async () => {
    const { status, body } = await get('/api/analytics/location-visits?lat=100&radiusM=-1');

    expect(status).toBe(400);
    expect(body).toEqual({
      error: {
        code: 'invalid-payload',
        problems: [
          'lat must be a latitude (−90 to 90).',
          'lng is required.',
          'radiusM must be 1–5000 metres.',
        ],
      },
    });
  });

  it('is read-only, local and robust (NFR-07, NFR-08)', async () => {
    expect((await fetch(`${base}/api/analytics/distance-by-year`, { method: 'POST' })).status).toBe(
      405,
    );
    expect((await get('/api/analytics/speed')).status).toBe(404);
    expect((await fetch(`${base}/api/uploads`)).status).toBe(418);
    const crossSite = await fetch(`${base}/api/analytics`, {
      headers: { Origin: 'https://x.test' },
    });
    expect(crossSite.status).toBe(403);
  });

  it('answers 503 when storage cannot be opened', async () => {
    await new Promise((resolve) => server.close(resolve));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await start(() => {
      throw new Error('locked');
    });

    expect((await get('/api/analytics/distance-by-year')).body).toEqual({
      error: { code: 'storage-unavailable' },
    });
  });
});

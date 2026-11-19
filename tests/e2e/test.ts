import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test as base } from '@playwright/test';
import { createRidesApi } from '../../server/http/ridesApi';
import { openRideRepository } from '../../server/rides/rideRepository';

/**
 * Minimal MapLibre style served instead of the real tile provider, so e2e tests are deterministic
 * and work offline. It has a plain background and no tiles, glyphs or sprites to fetch.
 */
export const STUB_MAP_STYLE = {
  version: 8,
  name: 'e2e-stub',
  sources: {},
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#e2e8f0' } }],
};

const RIDE_API_PATH = /^\/api\/(uploads|rides)(\/|$)/;

/**
 * Playwright `test` with the map tile provider stubbed for every page, and a ride history of its
 * own for every test: the real ride API (`createRidesApi`, ADR-0013) over a fresh in-memory
 * database, so uploads never leak between tests that run in parallel. The history survives page
 * reloads within a test, as the stored history survives a restart (AC-34).
 */
export const test = base.extend<{ stubMapTiles: void; rideHistory: void }>({
  stubMapTiles: [
    async ({ page }, use) => {
      await page.route('https://tiles.openfreemap.org/**', (route) =>
        route.fulfill({ json: STUB_MAP_STYLE }),
      );
      await use();
    },
    { auto: true },
  ],
  rideHistory: [
    async ({ context }, use) => {
      const repository = openRideRepository(':memory:');
      const api = createRidesApi(() => repository);
      const server = createServer((req, res) =>
        api(req, res, () => {
          res.statusCode = 404;
          res.end();
        }),
      );
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

      await context.route(
        (url) => RIDE_API_PATH.test(url.pathname),
        async (route) => {
          const request = route.request();
          const { pathname, search } = new URL(request.url());
          const contentType = request.headers()['content-type'];
          const body = request.postDataBuffer();
          const response = await fetch(`${base}${pathname}${search}`, {
            method: request.method(),
            headers: contentType ? { 'Content-Type': contentType } : {},
            ...(body ? { body } : {}),
          });
          await route.fulfill({
            status: response.status,
            headers: { 'Content-Type': response.headers.get('content-type') ?? 'text/plain' },
            body: Buffer.from(await response.arrayBuffer()),
          });
        },
      );
      await use();
      await new Promise((resolve) => server.close(resolve));
      repository.close();
    },
    { auto: true },
  ],
});

export { expect } from '@playwright/test';

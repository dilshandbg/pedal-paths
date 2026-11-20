import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test as base } from '@playwright/test';
import { createRideAnalytics } from '../../server/analytics/rideAnalytics';
import {
  createProviderRegistry,
  DEFAULT_PROVIDER_FACTORIES,
} from '../../server/assistant/llm/registry';
import { createAssistantService } from '../../server/assistant/service';
import { openSettingsFile } from '../../server/assistant/settingsFile';
import { summarizeHistory } from '../../server/assistant/systemPrompt';
import { createAnalyticsApi } from '../../server/http/analyticsApi';
import { createAssistantApi } from '../../server/http/assistantApi';
import { createRidesApi } from '../../server/http/ridesApi';
import { openRideRepository } from '../../server/rides/rideRepository';
import { startMockOllama, type MockOllama } from './mockOllama';

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

const API_PATH = /^\/api\/(uploads|rides|analytics|assistant)(\/|$)/;
const TIME_ZONE = 'UTC';

/**
 * Playwright `test` with the map tile provider stubbed for every page, and a backend of its own for
 * every test: the real ride, analytics and assistant APIs (ADR-0013, ADR-0014) over a fresh
 * in-memory database, so uploads never leak between tests that run in parallel. The history
 * survives page reloads within a test, as the stored history survives a restart (AC-34).
 *
 * The assistant uses the real Ollama adapter, pointed at a mocked Ollama on this machine
 * (`ollama`). A request the page aborts (Stop, Cancel) is aborted on the backend too.
 */
export const test = base.extend<{ stubMapTiles: void; ollama: MockOllama; rideHistory: void }>({
  ollama: [
    // eslint-disable-next-line no-empty-pattern -- Playwright takes a fixture's dependencies as an object; this one has none.
    async ({}, use) => {
      const ollama = await startMockOllama();
      await use(ollama);
      await ollama.close();
    },
    { scope: 'test' },
  ],
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
    async ({ context, ollama }, use) => {
      const repository = openRideRepository(':memory:');
      const analytics = createRideAnalytics(repository, TIME_ZONE);
      const file = openSettingsFile(null);
      file.update({ settings: { provider: 'ollama', serverUrl: ollama.url, model: null } });
      const assistant = createAssistantService({
        registry: createProviderRegistry(DEFAULT_PROVIDER_FACTORIES),
        file,
        analytics: () => analytics,
        history: () => summarizeHistory(repository.listRideDetails(), TIME_ZONE),
        timeZone: TIME_ZONE,
        log: () => {},
      });
      const apis = [
        createRidesApi(() => repository),
        createAnalyticsApi(() => analytics),
        createAssistantApi(() => assistant),
      ];
      const server = createServer((req, res) => {
        const next = (index: number): void => {
          const api = apis[index];
          if (!api) {
            res.statusCode = 404;
            res.end();
            return;
          }
          api(req, res, () => next(index + 1));
        };
        next(0);
      });
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

      // A request the page gives up on (Stop, Cancel) is aborted on the backend too.
      const inFlight = new Map<unknown, AbortController>();
      context.on('requestfailed', (request) => inFlight.get(request)?.abort());

      await context.route(
        (url) => API_PATH.test(url.pathname),
        async (route) => {
          const request = route.request();
          const { pathname, search } = new URL(request.url());
          const contentType = request.headers()['content-type'];
          const body = request.postDataBuffer();
          const controller = new AbortController();
          inFlight.set(request, controller);
          let response: Response;
          let payload: Buffer;
          try {
            response = await fetch(`${base}${pathname}${search}`, {
              method: request.method(),
              headers: contentType ? { 'Content-Type': contentType } : {},
              ...(body ? { body } : {}),
              signal: controller.signal,
            });
            // Event streams arrive whole: route.fulfill cannot stream.
            payload = Buffer.from(await response.arrayBuffer());
          } catch {
            // Aborted by the page, or the test is ending and its server is closing.
            await route.abort().catch(() => undefined);
            return;
          } finally {
            inFlight.delete(request);
          }
          await route
            .fulfill({
              status: response.status,
              headers: { 'Content-Type': response.headers.get('content-type') ?? 'text/plain' },
              body: payload,
            })
            .catch(() => undefined);
        },
      );
      await use();
      // Stop forwarding before the server closes, so no request reaches a closed server.
      await context.unrouteAll({ behavior: 'ignoreErrors' });
      assistant.close();
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      repository.close();
    },
    { auto: true },
  ],
});

export { expect } from '@playwright/test';

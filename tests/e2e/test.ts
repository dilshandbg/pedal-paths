import { test as base } from '@playwright/test';

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

/** Playwright `test` with the map tile provider stubbed for every page. */
export const test = base.extend<{ stubMapTiles: void }>({
  stubMapTiles: [
    async ({ page }, use) => {
      await page.route('https://tiles.openfreemap.org/**', (route) =>
        route.fulfill({ json: STUB_MAP_STYLE }),
      );
      await use();
    },
    { auto: true },
  ],
});

export { expect } from '@playwright/test';

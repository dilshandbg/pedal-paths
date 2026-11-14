import { makeSampleExport } from '../fixtures/stravaExport';
import { expect, test } from './test';

/** BR-06: real MapLibre + deck.gl rendering in Chromium (tiles stubbed, see ./test.ts). */
test.describe('BR-06: interactive map', () => {
  test('renders an interactive map with zoom controls before any data is loaded', async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    await page.goto('/');

    const map = page.getByRole('region', { name: 'Ride map' });
    await expect(map.locator('canvas.maplibregl-canvas')).toBeVisible();
    await expect(map.getByRole('button', { name: 'Zoom in' })).toBeEnabled();
    // Regression: the map container must fill the panel (MapLibre's own CSS once collapsed it).
    const canvasBox = await map.locator('canvas.maplibregl-canvas').boundingBox();
    expect(canvasBox?.height ?? 0).toBeGreaterThan(200);
    await expect(map.getByRole('button', { name: 'Zoom out' })).toBeEnabled();
    await expect(map).toContainText('Load your Strava export ZIP');
    // Regression: MapLibre's own worker must load from the bundle (setupMapLibre).
    expect(consoleErrors.filter((text) => /worker/i.test(text))).toEqual([]);
  });

  test('zooms and pans: the drawn routes move on screen', async ({ page }) => {
    await page.goto('/');
    const map = page.getByRole('region', { name: 'Ride map' });
    await page.getByLabel('Strava export ZIP file').setInputFiles({
      name: 'export.zip',
      mimeType: 'application/zip',
      buffer: Buffer.from(makeSampleExport()),
    });
    await expect(map.getByRole('status')).toHaveText('Showing 3 rides on the map');
    // Let the fit-to-rides camera animation finish before comparing pixels.
    await page.waitForTimeout(1000);

    const initial = await map.screenshot();

    await map.getByRole('button', { name: 'Zoom out' }).click();
    await page.waitForTimeout(600);
    const zoomedOut = await map.screenshot();
    expect(zoomedOut.equals(initial)).toBe(false);

    const box = await map.boundingBox();
    if (!box) throw new Error('map has no size');
    const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await page.mouse.move(centre.x, centre.y);
    await page.mouse.down();
    await page.mouse.move(centre.x + 120, centre.y + 60, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(600);
    const panned = await map.screenshot();
    expect(panned.equals(zoomedOut)).toBe(false);
  });

  test('draws the loaded rides on the map (AC-05, AC-15)', async ({ page }) => {
    await page.goto('/');
    const map = page.getByRole('region', { name: 'Ride map' });

    await page.getByLabel('Strava export ZIP file').setInputFiles({
      name: 'export.zip',
      mimeType: 'application/zip',
      buffer: Buffer.from(makeSampleExport()),
    });

    await expect(map.getByRole('status')).toHaveText('Showing 3 rides on the map');
    await expect(map).not.toContainText('Load your Strava export ZIP');
    // deck.gl draws routes on its own canvas above the base map.
    await expect(map.locator('canvas')).toHaveCount(2);
  });
});

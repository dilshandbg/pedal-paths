import { makeSharedRoadExport } from '../fixtures/stravaExport';
import { expect, test } from './test';

test.describe('BR-10: dynamic heat map', () => {
  test('AC-11: filter changes update the heat map without a page reload', async ({ page }) => {
    await page.goto('/');
    const map = page.getByRole('region', { name: 'Ride map' });
    await page.getByLabel('Strava export ZIP file').setInputFiles({
      name: 'export.zip',
      mimeType: 'application/zip',
      buffer: Buffer.from(makeSharedRoadExport()),
    });
    await expect(map.getByRole('status')).toHaveText('Showing 4 rides on the map');
    // Let the fit-to-rides camera animation finish before comparing pixels.
    await page.waitForTimeout(1000);

    // A reload would wipe this marker and fire a new navigation.
    let navigations = 0;
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) navigations += 1;
    });
    await page.evaluate(() => {
      (window as unknown as { __noReload: boolean }).__noReload = true;
    });

    const before = await map.screenshot();
    await page
      .getByRole('group', { name: 'Rides' })
      .getByRole('checkbox', { name: 'Ride 4' })
      .uncheck();
    await expect(map.getByRole('status')).toHaveText('Showing 3 rides on the map');
    await page.waitForTimeout(300);
    const afterRide = await map.screenshot();
    expect(afterRide.equals(before)).toBe(false); // the separate road is no longer drawn

    await page.getByRole('checkbox', { name: 'March' }).check();
    await page.getByRole('checkbox', { name: '2024' }).check();
    await expect(map.getByRole('status')).toHaveText('Showing 3 rides on the map');
    await page.getByRole('button', { name: 'Reset filters' }).click();
    await expect(map.getByRole('status')).toHaveText('Showing 4 rides on the map');
    await expect(map.getByRole('figure', { name: 'Heat map legend' })).toContainText('3 rides');

    expect(navigations).toBe(0);
    expect(
      await page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload),
    ).toBe(true);
    await expect(map.locator('canvas')).toHaveCount(2); // same base map + deck.gl canvas
  });
});

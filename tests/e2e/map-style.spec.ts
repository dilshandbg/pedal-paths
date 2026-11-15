import { makeSharedRoadExport } from '../fixtures/stravaExport';
import { expect, test } from './test';

test.describe('BR-32: map style', () => {
  test('switching to the dark map keeps the rides, recolours the legend and is remembered', async ({
    page,
  }) => {
    await page.goto('/');
    const map = page.getByRole('region', { name: 'Ride map' });
    await page.getByLabel('Strava export ZIP file').setInputFiles({
      name: 'export.zip',
      mimeType: 'application/zip',
      buffer: Buffer.from(makeSharedRoadExport()),
    });
    await expect(map.getByRole('status')).toHaveText('Showing 4 rides on the map');

    const style = page.getByRole('combobox', { name: 'Map style' });
    await expect(style).toHaveValue('liberty');
    const ramp = map.getByRole('figure', { name: 'Heat map legend' }).locator('[aria-hidden]');
    const lightRamp = await ramp.evaluate((el) => getComputedStyle(el).backgroundImage);
    expect(lightRamp).toContain('rgb(247, 104, 161)'); // magenta–purple, lightest first

    await style.selectOption({ label: 'Dark' });
    await expect(map.getByRole('status')).toHaveText('Showing 4 rides on the map');
    await expect
      .poll(() => ramp.evaluate((el) => getComputedStyle(el).backgroundImage))
      .not.toBe(lightRamp);

    await page.reload();
    await expect(page.getByRole('combobox', { name: 'Map style' })).toHaveValue('dark');
  });
});

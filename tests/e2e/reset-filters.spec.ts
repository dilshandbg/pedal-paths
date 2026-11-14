import { makeSampleExport } from '../fixtures/stravaExport';
import { expect, test } from './test';

test.describe('BR-15: reset filters', () => {
  test('AC-14: resetting restores the view of all eligible rides', async ({ page }) => {
    await page.goto('/');
    const map = page.getByRole('region', { name: 'Ride map' });
    await page.getByLabel('Strava export ZIP file').setInputFiles({
      name: 'export.zip',
      mimeType: 'application/zip',
      buffer: Buffer.from(makeSampleExport()),
    });
    await expect(map.getByRole('status')).toHaveText('Showing 3 rides on the map');
    const reset = page.getByRole('button', { name: 'Reset filters' });
    await expect(reset).toBeDisabled();

    await page.getByRole('checkbox', { name: '2023' }).check();
    await page.getByRole('checkbox', { name: 'November' }).check();
    await page.getByRole('checkbox', { name: /Morning Ride/ }).uncheck();
    await expect(map.getByRole('status')).toHaveText('Showing 0 rides on the map');

    await reset.click();

    await expect(map.getByRole('status')).toHaveText('Showing 3 rides on the map');
    await expect(page.getByRole('checkbox', { name: 'All years' })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'All months' })).toBeChecked();
    const rides = page.getByRole('group', { name: 'Rides' }).getByRole('checkbox');
    await expect(rides).toHaveCount(3);
    for (const ride of await rides.all()) await expect(ride).toBeChecked();
    await expect(page.getByRole('region', { name: 'Active filters' })).toContainText('All rides');
    await expect(reset).toBeDisabled();
  });
});

import { makeSampleExport } from '../fixtures/stravaExport';
import { expect, test } from './test';

test.describe('BR-07: year filter', () => {
  test('AC-07: selecting and deselecting years updates the map and the ride list', async ({
    page,
  }) => {
    await page.goto('/');
    const map = page.getByRole('region', { name: 'Ride map' });
    await page.getByLabel('Strava export ZIP file').setInputFiles({
      name: 'export.zip',
      mimeType: 'application/zip',
      buffer: Buffer.from(makeSampleExport()),
    });
    await expect(map.getByRole('status')).toHaveText('Showing 3 rides on the map');

    const years = page.getByRole('group', { name: 'Years' });
    const rides = page.getByRole('group', { name: 'Rides' });
    await expect(years.getByRole('checkbox', { name: 'All years' })).toBeChecked();

    await years.getByRole('checkbox', { name: '2022' }).check();
    await expect(map.getByRole('status')).toHaveText('Showing 1 ride on the map');
    await expect(rides.getByRole('checkbox')).toHaveCount(1);
    await expect(rides.getByRole('checkbox', { name: 'Lunch Ride' })).toBeVisible();

    await years.getByRole('checkbox', { name: '2023' }).check();
    await expect(map.getByRole('status')).toHaveText('Showing 3 rides on the map');

    await years.getByRole('checkbox', { name: '2022' }).uncheck();
    await expect(map.getByRole('status')).toHaveText('Showing 2 rides on the map');
    await expect(rides.getByRole('checkbox', { name: 'Lunch Ride' })).toHaveCount(0);

    await years.getByRole('checkbox', { name: 'All years' }).check();
    await expect(map.getByRole('status')).toHaveText('Showing 3 rides on the map');
  });
});

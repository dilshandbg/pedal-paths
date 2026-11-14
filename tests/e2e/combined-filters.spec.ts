import { makeSampleExport } from '../fixtures/stravaExport';
import { expect, test } from './test';

test.describe('BR-11: combined filters', () => {
  test('RULE-08 / UX-06: year, month and ride filters combine and are shown as active', async ({
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

    const active = page.getByRole('region', { name: 'Active filters' });
    await expect(active).toContainText('All years');
    await expect(active).toContainText('All months');
    await expect(active).toContainText('All rides');

    const years = page.getByRole('group', { name: 'Years' });
    const months = page.getByRole('group', { name: 'Months' });
    const rides = page.getByRole('group', { name: 'Rides' });

    // 2023 has a November ride and a June ride.
    await years.getByRole('checkbox', { name: '2023' }).check();
    await expect(map.getByRole('status')).toHaveText('Showing 2 rides on the map');
    await months.getByRole('checkbox', { name: 'November' }).check();
    await months.getByRole('checkbox', { name: 'June' }).check();
    await expect(map.getByRole('status')).toHaveText('Showing 2 rides on the map');

    await rides.getByRole('checkbox', { name: 'FIT Ride' }).uncheck();
    await expect(map.getByRole('status')).toHaveText('Showing 1 ride on the map');

    await expect(active.getByRole('definition')).toHaveText([
      '2023',
      'June, November',
      '1 ride deselected',
    ]);
  });
});

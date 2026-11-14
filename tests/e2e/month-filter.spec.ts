import { makeSampleExport } from '../fixtures/stravaExport';
import { expect, test } from './test';

test.describe('BR-08: month filter', () => {
  test('AC-08 / AC-10: months combine with years, including the same month across years', async ({
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
    const months = page.getByRole('group', { name: 'Months' });
    const rides = page.getByRole('group', { name: 'Rides' });
    await expect(months.getByRole('checkbox', { name: 'All months' })).toBeChecked();

    // November in 2022 and 2023 (AC-10).
    await years.getByRole('checkbox', { name: '2023' }).check();
    await years.getByRole('checkbox', { name: '2022' }).check();
    await months.getByRole('checkbox', { name: 'November' }).check();
    await expect(map.getByRole('status')).toHaveText('Showing 2 rides on the map');
    await expect(rides.getByRole('checkbox')).toHaveCount(2);
    await expect(rides.getByRole('checkbox', { name: 'FIT Ride' })).toHaveCount(0);

    // Adding June brings back the June 2023 ride; removing November leaves only it (AC-08).
    await months.getByRole('checkbox', { name: 'June' }).check();
    await expect(map.getByRole('status')).toHaveText('Showing 3 rides on the map');
    await months.getByRole('checkbox', { name: 'November' }).uncheck();
    await expect(map.getByRole('status')).toHaveText('Showing 1 ride on the map');
    await expect(rides.getByRole('checkbox', { name: 'FIT Ride' })).toBeVisible();

    await months.getByRole('checkbox', { name: 'All months' }).check();
    await expect(map.getByRole('status')).toHaveText('Showing 3 rides on the map');
  });
});

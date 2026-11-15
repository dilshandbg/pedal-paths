import { makeSampleExport } from '../fixtures/stravaExport';
import { expect, test } from './test';

test.describe('BR-14 / BR-19: activity count and statistics', () => {
  test('AC-13 / AC-19: count and statistics reflect the filtered rides', async ({ page }) => {
    await page.goto('/');
    const statistics = page.getByRole('region', { name: 'Statistics' });
    await expect(statistics).toContainText('Statistics will appear here');

    await page.getByLabel('Strava export ZIP file').setInputFiles({
      name: 'export.zip',
      mimeType: 'application/zip',
      buffer: Buffer.from(makeSampleExport()),
    });
    const values = statistics.getByRole('definition');
    await expect(values.first()).toHaveText('3 rides');

    // The single 2022 ride: 2,900 m, 29 m of climbing and 600 s of moving time in activities.csv.
    await page.getByRole('checkbox', { name: '2022' }).check();
    await expect(values).toHaveText(['1 ride', '2.9 km', '29 m', '10 min', '2.9 km']);

    await page.getByRole('checkbox', { name: 'Lunch Ride' }).uncheck();
    await expect(values).toHaveText(['0 rides', '0.0 km', '0 m', 'Not available', 'Not available']);

    await page.getByRole('button', { name: 'Reset filters' }).click();
    await expect(values.first()).toHaveText('3 rides');
  });
});

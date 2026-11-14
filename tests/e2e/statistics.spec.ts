import { makeSampleExport } from '../fixtures/stravaExport';
import { expect, test } from './test';

test.describe('BR-14: activity count and statistics', () => {
  test('AC-13: the activity count reflects the filtered rides', async ({ page }) => {
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

    // The single 2022 ride: 2,900 m and 29 m of climbing in activities.csv.
    await page.getByRole('checkbox', { name: '2022' }).check();
    await expect(values).toHaveText(['1 ride', '2.9 km', '29 m']);

    await page.getByRole('checkbox', { name: 'Lunch Ride' }).uncheck();
    await expect(values).toHaveText(['0 rides', '0.0 km', '0 m']);

    await page.getByRole('button', { name: 'Reset filters' }).click();
    await expect(values.first()).toHaveText('3 rides');
  });
});

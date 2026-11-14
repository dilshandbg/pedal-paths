import { makeSampleExport } from '../fixtures/stravaExport';
import { expect, test } from './test';

test.describe('BR-13: activity details', () => {
  test('each ride shows its name, date, distance and elevation gain', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Strava export ZIP file').setInputFiles({
      name: 'export.zip',
      mimeType: 'application/zip',
      buffer: Buffer.from(makeSampleExport()),
    });

    const rides = page.getByRole('group', { name: 'Rides' });
    // activities.csv: 2,900 m and 29 m of climbing for the GPX rides.
    const lunch = rides.getByRole('checkbox', { name: 'Lunch Ride' });
    await expect(lunch).toHaveAccessibleDescription(/2022 · 2\.9 km · 29 m gain$/);
    await expect(rides.getByText(/2022 · 2\.9 km · 29 m gain$/)).toBeVisible();
    // The FIT ride has no distance in the CSV: it falls back to the track (ADR-0007).
    await expect(rides.getByRole('checkbox', { name: 'FIT Ride' })).toHaveAccessibleDescription(
      /2023 · \d+\.\d km/,
    );
  });
});

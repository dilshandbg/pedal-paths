import { expect, test } from '@playwright/test';
import {
  makeActivitiesCsv,
  makeGpx,
  makeSampleExport,
  makeTrackPoints,
  makeZip,
} from '../fixtures/stravaExport';

/** Runs the real Web Worker pipeline in a browser with synthetic export archives. */
test.describe('ZIP upload', () => {
  test('AC-01 / AC-02 / AC-05: loads Rides from GPX and FIT files in the original export ZIP', async ({
    page,
  }) => {
    await page.goto('/');

    await page.getByLabel('Strava export ZIP file').setInputFiles({
      name: 'export_12345.zip',
      mimeType: 'application/zip',
      buffer: Buffer.from(makeSampleExport()),
    });

    const summary = page.getByRole('region', { name: 'Loaded data' });
    await expect(summary.getByText('3 rides loaded')).toBeVisible();
    await expect(summary.getByText('2 non-ride activities excluded')).toBeVisible();
    await expect(summary.getByText('3 rides could not be processed')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Map' })).toContainText('3 rides loaded');
  });

  test('AC-15: loading a different ZIP replaces the dataset', async ({ page }) => {
    await page.goto('/');
    const input = page.getByLabel('Strava export ZIP file');

    await input.setInputFiles({
      name: 'first.zip',
      mimeType: 'application/zip',
      buffer: Buffer.from(makeSampleExport()),
    });
    await expect(page.getByText('3 rides loaded').first()).toBeVisible();

    const single = makeZip({
      'activities.csv': makeActivitiesCsv([
        {
          id: '1',
          date: 'Jan 1, 2024, 8:00:00 AM',
          name: 'Only ride',
          type: 'Ride',
          fileName: 'activities/1.gpx',
        },
      ]),
      'activities/1.gpx': makeGpx(makeTrackPoints(10)),
    });
    await input.setInputFiles({
      name: 'second.zip',
      mimeType: 'application/zip',
      buffer: Buffer.from(single),
    });

    const summary = page.getByRole('region', { name: 'Loaded data' });
    await expect(summary.getByText('1 ride loaded')).toBeVisible();
    await expect(summary.getByText('second.zip')).toBeVisible();
  });

  test('AC-16: shows a clear message for a file that is not a ZIP', async ({ page }) => {
    await page.goto('/');

    await page.getByLabel('Strava export ZIP file').setInputFiles({
      name: 'activities.zip',
      mimeType: 'application/zip',
      buffer: Buffer.from('Activity ID,Activity Type\n1,Ride\n'),
    });

    const alert = page.getByRole('alert');
    await expect(alert).toContainText('Could not load activities.zip');
    await expect(alert).toContainText('not a ZIP archive');
  });

  test('AC-16: explains when an export has no eligible rides', async ({ page }) => {
    await page.goto('/');

    await page.getByLabel('Strava export ZIP file').setInputFiles({
      name: 'runs-only.zip',
      mimeType: 'application/zip',
      buffer: Buffer.from(
        makeZip({
          'activities.csv': makeActivitiesCsv([
            { id: '1', date: 'Jan 1, 2024, 8:00:00 AM', name: 'Run', type: 'Run', fileName: '' },
          ]),
        }),
      ),
    });

    await expect(page.getByRole('alert')).toContainText('No Ride activities with GPS data');
  });
});

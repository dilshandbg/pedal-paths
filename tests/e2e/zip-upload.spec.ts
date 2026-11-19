import { expect, test } from './test';
import {
  makeActivitiesCsv,
  makeSampleExport,
  makeSingleRideExport,
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

    const summary = page.getByRole('region', { name: 'Last upload' });
    await expect(summary.getByText('3 rides in this file, 3 new')).toBeVisible();
    await expect(summary.getByText('2 non-ride activities excluded')).toBeVisible();
    await expect(summary.getByText('3 rides could not be processed')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Ride map' }).getByRole('status')).toHaveText(
      'Showing 3 rides on the map',
    );
  });

  test('AC-15 / AC-35: another export adds its rides to the stored ones', async ({ page }) => {
    await page.goto('/');
    const input = page.getByLabel('Strava export ZIP file');

    await input.setInputFiles({
      name: 'first.zip',
      mimeType: 'application/zip',
      buffer: Buffer.from(makeSampleExport()),
    });
    await expect(page.getByText('3 rides stored')).toBeVisible();

    await input.setInputFiles({
      name: 'second.zip',
      mimeType: 'application/zip',
      buffer: Buffer.from(makeSingleRideExport('9001', 'Added ride')),
    });

    const history = page.getByRole('region', { name: 'Ride history' });
    await expect(history.getByText('4 rides stored')).toBeVisible();
    await expect(history.getByText('from 2 uploads')).toBeVisible();
    const summary = page.getByRole('region', { name: 'Last upload' });
    await expect(summary.getByText('second.zip')).toBeVisible();
    await expect(summary.getByText('1 ride in this file, 1 new')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Ride map' }).getByRole('status')).toHaveText(
      'Showing 4 rides on the map',
    );
  });

  test('AC-34: the stored rides are shown again after a restart', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Strava export ZIP file').setInputFiles({
      name: 'export.zip',
      mimeType: 'application/zip',
      buffer: Buffer.from(makeSampleExport()),
    });
    await expect(page.getByText('3 rides stored')).toBeVisible();

    await page.reload();

    await expect(page.getByRole('region', { name: 'Ride history' })).toContainText(
      '3 rides stored',
    );
    await expect(page.getByRole('region', { name: 'Ride map' }).getByRole('status')).toHaveText(
      'Showing 3 rides on the map',
    );
    await expect(page.getByText('Add another export ZIP')).toBeVisible();
  });

  test('AC-18 / AC-41: the same file again is refused; rides are never doubled', async ({
    page,
  }) => {
    await page.goto('/');
    const input = page.getByLabel('Strava export ZIP file');
    const zip = Buffer.from(makeSampleExport());

    await input.setInputFiles({ name: 'export.zip', mimeType: 'application/zip', buffer: zip });
    await expect(page.getByText('3 rides stored')).toBeVisible();
    await input.setInputFiles({ name: 'export (1).zip', mimeType: 'application/zip', buffer: zip });

    const alert = page.getByRole('alert');
    await expect(alert).toContainText('Could not load export (1).zip');
    await expect(alert).toContainText('This file was already imported on');
    await expect(alert).toContainText('as “export.zip”. Nothing was imported again.');
    await expect(page.getByText('3 rides stored')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Ride map' }).getByRole('status')).toHaveText(
      'Showing 3 rides on the map',
    );
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

import type { Page } from '@playwright/test';
import { expect, test } from './test';
import { makeSampleExport, makeSingleRideExport } from '../fixtures/stravaExport';

/** Uploads an export through the Rides tab and waits until the history holds `total` rides. */
async function upload(page: Page, name: string, zip: Uint8Array, total: string) {
  await page.getByLabel('Strava export ZIP file').setInputFiles({
    name,
    mimeType: 'application/zip',
    buffer: Buffer.from(zip),
  });
  await expect(page.getByRole('region', { name: 'Ride history' })).toContainText(total);
}

const mapStatus = (page: Page) =>
  page.getByRole('region', { name: 'Ride map' }).getByRole('status');
const uploadsList = (page: Page) => page.getByRole('list', { name: 'Uploads' });

/** Runs against the real ride API and database (one per test, see `test.ts`). */
test.describe('BR-35 / BR-36: managing uploads', () => {
  test('AC-36 / AC-37: lists uploads; deleting one removes its own rides, also after a restart', async ({
    page,
  }) => {
    await page.goto('/');
    await upload(page, 'export_2024.zip', makeSampleExport(), '3 rides stored');
    await upload(page, 'extra.zip', makeSingleRideExport('9001'), '4 rides stored');

    await page.getByRole('tab', { name: 'Uploads' }).click();
    const extra = uploadsList(page).getByRole('listitem', { name: 'extra.zip' });
    await expect(extra).toContainText('1 ride (1 new)');
    await expect(extra).toContainText('Complete');
    await expect(
      uploadsList(page).getByRole('listitem', { name: 'export_2024.zip' }),
    ).toContainText('Complete, some rides skipped');

    await extra.getByRole('button', { name: 'Delete' }).click();
    await extra.getByRole('button', { name: 'Delete upload' }).click();
    await expect(page.getByText('Deleted 1 upload and 1 ride.')).toBeVisible();
    await expect(uploadsList(page).getByRole('listitem')).toHaveCount(1);
    await expect(mapStatus(page)).toHaveText('Showing 3 rides on the map');

    await page.reload();
    await expect(page.getByRole('region', { name: 'Ride history' })).toContainText(
      '3 rides stored',
    );
    await page.getByRole('tab', { name: 'Uploads' }).click();
    await expect(uploadsList(page).getByRole('listitem')).toHaveCount(1);
  });

  test('AC-38 / AC-39: deletes selected uploads, then everything after confirming', async ({
    page,
  }) => {
    await page.goto('/');
    await upload(page, 'a.zip', makeSingleRideExport('1'), '1 ride stored');
    await upload(page, 'b.zip', makeSingleRideExport('2'), '2 rides stored');
    await upload(page, 'c.zip', makeSingleRideExport('3'), '3 rides stored');
    await page.getByRole('tab', { name: 'Uploads' }).click();

    await page.getByRole('checkbox', { name: 'Select a.zip' }).check();
    await page.getByRole('checkbox', { name: 'Select b.zip' }).check();
    await page.getByRole('button', { name: 'Delete selected (2)' }).click();
    await page.getByRole('button', { name: 'Delete selected', exact: true }).click();
    await expect(page.getByText('Deleted 2 uploads and 2 rides.')).toBeVisible();
    await expect(uploadsList(page).getByRole('listitem')).toHaveCount(1);

    await page.getByRole('button', { name: 'Delete all uploads' }).click();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(uploadsList(page).getByRole('listitem')).toHaveCount(1);

    await page.getByRole('button', { name: 'Delete all uploads' }).click();
    await page.getByRole('button', { name: 'Delete all', exact: true }).click();
    await expect(page.getByText('No uploads yet.')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Ride map' })).toContainText(
      'Load your Strava export ZIP to see your rides on the map.',
    );

    await page.reload();
    await page.getByRole('tab', { name: 'Uploads' }).click();
    await expect(page.getByText('No uploads yet.')).toBeVisible();
  });
});

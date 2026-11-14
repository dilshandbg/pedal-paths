import { makeSampleExport, makeSharedRoadExport } from '../fixtures/stravaExport';
import { expect, test } from './test';

test.describe('BR-12: heat map by how often roads are ridden', () => {
  test('AC-12: the legend scales to the most-ridden road', async ({ page }) => {
    await page.goto('/');
    const map = page.getByRole('region', { name: 'Ride map' });
    await page.getByLabel('Strava export ZIP file').setInputFiles({
      name: 'export.zip',
      mimeType: 'application/zip',
      buffer: Buffer.from(makeSharedRoadExport()),
    });

    await expect(map.getByRole('status')).toHaveText('Showing 4 rides on the map');
    const legend = map.getByRole('figure', { name: 'Heat map legend' });
    await expect(legend).toContainText('1 ride');
    await expect(legend).toContainText('3 rides');
  });

  test('rides on separate roads all have the same, lowest frequency', async ({ page }) => {
    await page.goto('/');
    const map = page.getByRole('region', { name: 'Ride map' });
    await page.getByLabel('Strava export ZIP file').setInputFiles({
      name: 'export.zip',
      mimeType: 'application/zip',
      buffer: Buffer.from(makeSampleExport()),
    });

    await expect(map.getByRole('status')).toHaveText('Showing 3 rides on the map');
    const legend = map.getByRole('figure', { name: 'Heat map legend' });
    await expect(legend).toContainText('Rides on a road');
    await expect(legend).not.toContainText('rides');
  });
});

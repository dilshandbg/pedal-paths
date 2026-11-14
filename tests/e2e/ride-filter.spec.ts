import { makeSharedRoadExport } from '../fixtures/stravaExport';
import { expect, test } from './test';

test.describe('BR-09: individual ride filter', () => {
  test('AC-09: deselecting rides removes them from the heat map, reselecting restores them', async ({
    page,
  }) => {
    await page.goto('/');
    const map = page.getByRole('region', { name: 'Ride map' });
    await page.getByLabel('Strava export ZIP file').setInputFiles({
      name: 'export.zip',
      mimeType: 'application/zip',
      buffer: Buffer.from(makeSharedRoadExport()),
    });
    await expect(map.getByRole('status')).toHaveText('Showing 4 rides on the map');
    const legend = map.getByRole('figure', { name: 'Heat map legend' });
    await expect(legend).toContainText('3 rides');

    const rides = page.getByRole('group', { name: 'Rides' });
    await rides.getByRole('checkbox', { name: 'Ride 1' }).uncheck();

    await expect(map.getByRole('status')).toHaveText('Showing 3 rides on the map');
    await expect(legend).toContainText('2 rides');

    await rides.getByRole('checkbox', { name: 'Ride 1' }).check();
    await expect(map.getByRole('status')).toHaveText('Showing 4 rides on the map');
    await expect(legend).toContainText('3 rides');
  });
});

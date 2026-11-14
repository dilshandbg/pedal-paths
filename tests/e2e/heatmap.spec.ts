import {
  makeActivitiesCsv,
  makeGpx,
  makeSampleExport,
  makeTrackPoints,
  makeZip,
} from '../fixtures/stravaExport';
import { expect, test } from './test';

/** Three synthetic rides on the same road, and one on its own road. */
function makeSharedRoadExport(): Uint8Array {
  const road = makeTrackPoints(30, { latitude: 0.001, longitude: 0.001, stepMetres: 20 });
  const elsewhere = makeTrackPoints(30, { latitude: 0.001, longitude: 0.05, stepMetres: 20 });
  const ids = ['1', '2', '3', '4'];
  return makeZip({
    'activities.csv': makeActivitiesCsv(
      ids.map((id) => ({
        id,
        date: `Mar ${id}, 2024, 7:00:00 AM`,
        name: `Ride ${id}`,
        type: 'Ride',
        fileName: `activities/${id}.gpx`,
      })),
    ),
    'activities/1.gpx': makeGpx(road),
    'activities/2.gpx': makeGpx(road),
    'activities/3.gpx': makeGpx(road),
    'activities/4.gpx': makeGpx(elsewhere),
  });
}

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

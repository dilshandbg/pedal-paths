import type { Page } from '@playwright/test';
import { expect, test } from './test';

/*
 * Segment import journey against the real local backend (Vite preview + in-memory SQLite, see
 * playwright.config.ts). Both browser projects share one database, so every project uses its own
 * synthetic segment IDs and names. SYNTHETIC data only.
 */

/** Distinct IDs per browser project and per test, as all of them share one database. */
const idsFor = (project: string, test: number) => {
  const base = (project.startsWith('mobile') ? 92_000_000 : 91_000_000) + test * 1000;
  return { hill: String(base + 1), flat: String(base + 2) };
};

const segmentFile = (test: number, project: string, hillName: string, extraEffort = false) => {
  const { hill, flat } = idsFor(project, test);
  return {
    name: 'segments.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        segments: [
          {
            id: Number(hill),
            name: hillName,
            distance: 2684.8,
            total_elevation_gain: 155.7,
            start_latlng: [37.8331, -122.4834],
            end_latlng: [37.8281, -122.4981],
            map: { polyline: '_p~iF~ps|U_ulLnnqC_mqNvxq`@' },
            efforts: [
              { id: Number(hill) * 10 + 1, start_date: '2024-06-01T07:12:00Z', elapsed_time: 560 },
              { id: Number(hill) * 10 + 2, start_date: '2023-05-14T06:40:10Z', elapsed_time: 553 },
              ...(extraEffort
                ? [
                    {
                      id: Number(hill) * 10 + 3,
                      start_date: '2025-03-01T07:00:00Z',
                      elapsed_time: 540,
                    },
                  ]
                : []),
            ],
          },
          { id: Number(flat), name: `${hillName} flat`, distance: 400, total_elevation_gain: 3 },
        ],
      }),
    ),
  };
};

async function openSegments(page: Page) {
  await page.getByRole('tab', { name: 'Segments' }).click();
  return page.getByRole('region', { name: 'Segments' });
}

test.describe('BR-20 – BR-28: segment import', () => {
  test('AC-20 – AC-28: import, review, browse, update and remove segments', async ({
    page,
  }, testInfo) => {
    const project = testInfo.project.name;
    const name = `E2E Hill ${project}`;
    const requests: string[] = [];
    page.on('request', (request) => requests.push(request.url()));

    await page.goto('/');
    const section = await openSegments(page);
    const fileInput = page.getByLabel('Segment file (JSON, GeoJSON or CSV)');

    // AC-21: an invalid file is rejected with its record and field.
    await fileInput.setInputFiles({
      name: 'broken.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify([{ id: 5, name: '', distance: -1 }])),
    });
    const problems = section.getByRole('alert');
    await expect(problems).toContainText('broken.json was not imported. Nothing was stored.');
    await expect(problems).toContainText('segment 1 (ID 5), name');
    await problems.getByRole('button', { name: 'Dismiss' }).click();

    // AC-22: review, then cancel stores nothing.
    await fileInput.setInputFiles(segmentFile(1, project, name));
    let review = section.getByRole('region', { name: 'Import review' });
    await expect(review).toContainText('2 new, 0 updates, 0 unchanged · 2 new efforts');
    await review.getByRole('button', { name: 'Cancel' }).click();
    await expect(section.getByRole('button', { name: new RegExp(name) })).toHaveCount(0);

    // AC-23: confirm, and the segments survive a reload.
    await fileInput.setInputFiles(segmentFile(1, project, name));
    review = section.getByRole('region', { name: 'Import review' });
    await review.getByRole('button', { name: 'Confirm import' }).click();
    await expect(section.getByRole('status').first()).toContainText(
      'Added 2 segments, stored 2 new efforts.',
    );
    await page.reload();
    await openSegments(page);
    const list = section.getByRole('list', { name: 'Segments' });
    // The button name is the segment name followed by its details.
    const hillButton = new RegExp(`^${name}\\s*2\\.7 km`);
    await expect(list.getByRole('button', { name: new RegExp(`^${name}`) })).toHaveCount(2);

    // AC-25: search and distance range.
    await section.getByLabel('Search by name').fill(`${name} flat`);
    await expect(list.getByRole('button')).toHaveCount(1);
    await section.getByLabel('Search by name').fill(name);
    await section.getByLabel('Minimum distance (km)').fill('1');
    await expect(list.getByRole('button')).toHaveCount(1);
    await section.getByLabel('Minimum distance (km)').fill('');

    // AC-26: details with the personal best marked.
    await list.getByRole('button', { name: hillButton }).click();
    const details = section.getByRole('region', { name: 'Segment details' });
    await expect(details.getByRole('heading', { name })).toBeVisible();
    await expect(details).toContainText('9:13 on May 14, 2023');
    await expect(details.getByRole('row').nth(1)).toContainText('★ Personal best');
    await details.getByRole('button', { name: '← Back to segments' }).click();

    // AC-24: a newer file updates the segment instead of duplicating it.
    await fileInput.setInputFiles(segmentFile(1, project, name, true));
    review = section.getByRole('region', { name: 'Import review' });
    await expect(review).toContainText('0 new, 1 update, 1 unchanged · 1 new effort');
    await review.getByRole('button', { name: 'Confirm import' }).click();
    await expect(list.getByRole('button', { name: hillButton })).toHaveCount(1);
    await expect(list.getByRole('button', { name: hillButton })).toContainText('PB 9:00');

    // AC-28: remove one segment after confirming; it stays removed after a reload.
    await list.getByRole('button', { name: new RegExp(`^${name} flat`) }).click();
    await details.getByRole('button', { name: 'Remove segment' }).click();
    await details.getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(list.getByRole('button', { name: new RegExp(`^${name} flat`) })).toHaveCount(0);
    await page.reload();
    await openSegments(page);
    await expect(list.getByRole('button', { name: new RegExp(`^${name}`) })).toHaveCount(1);

    // AC-29: nothing was requested from Strava.
    expect(requests.filter((url) => /strava\.com/i.test(url))).toEqual([]);
  });

  test('AC-27: segment routes are drawn without loading rides', async ({ page }, testInfo) => {
    const project = testInfo.project.name;
    await page.goto('/');
    const section = await openSegments(page);
    await page
      .getByLabel('Segment file (JSON, GeoJSON or CSV)')
      .setInputFiles(segmentFile(2, project, `E2E Map ${project}`));
    await section
      .getByRole('region', { name: 'Import review' })
      .getByRole('button', { name: 'Confirm import' })
      .click();
    await expect(section.getByRole('checkbox', { name: 'Show segments on the map' })).toBeChecked();
    // The map canvas exists and the ride heat map stays empty.
    await expect(
      page.getByRole('region', { name: 'Ride map' }).locator('canvas').first(),
    ).toBeVisible();
    await expect(page.getByRole('region', { name: 'Ride map' })).toContainText(
      'Load your Strava export ZIP',
    );
  });
});

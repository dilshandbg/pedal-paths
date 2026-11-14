import { expect, test } from '@playwright/test';

test.describe('application shell', () => {
  test('shows the title, filter panel, map and statistics panel', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle('Strava Cycling Heat Map');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Strava Cycling Heat Map' }),
    ).toBeVisible();
    await expect(page.getByRole('complementary', { name: 'Activity filters' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Map' })).toBeVisible();
    await expect(page.getByRole('complementary', { name: 'Activity statistics' })).toBeVisible();
  });

  test('does not scroll horizontally', async ({ page }) => {
    await page.goto('/');

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);
  });
});

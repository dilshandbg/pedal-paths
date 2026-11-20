import type { Page } from '@playwright/test';
import { makeSampleExport } from '../fixtures/stravaExport';
import { expect, test } from './test';

/*
 * The local assistant journey (BRD v2.4, implementation plan phase 5) on the real backend: the real
 * ride, analytics and assistant APIs and the real Ollama adapter, talking over HTTP to a mocked
 * Ollama on this machine (`mockOllama.ts`). No Ollama is installed; nothing leaves the machine.
 *
 * Answers arrive in one piece here (Playwright's routing cannot stream); streaming itself is
 * covered by tests/integration/assistant.test.tsx.
 */

async function uploadSampleExport(page: Page) {
  await page.getByLabel('Strava export ZIP file').setInputFiles({
    name: 'export_2024.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from(makeSampleExport()),
  });
  await expect(page.getByRole('region', { name: 'Ride history' })).toContainText('3 rides stored');
}

const assistantTab = (page: Page) => page.getByRole('tab', { name: 'Assistant' });
const innerTab = (page: Page, name: 'Chat' | 'Settings') =>
  page.getByRole('tablist', { name: 'Assistant' }).getByRole('tab', { name });

/** Selects and tests the installed model in the settings, then opens the chat. */
async function selectAndTestModel(page: Page) {
  await innerTab(page, 'Settings').click();
  await page.getByRole('button', { name: 'Select qwen3:8b' }).click();
  // The selected model can't be selected again.
  await expect(page.getByRole('button', { name: 'Select qwen3:8b' })).toBeDisabled();
  await page.getByRole('button', { name: 'Test qwen3:8b' }).click();
  await expect(
    page.getByText('qwen3:8b passed the test and can answer ride questions.'),
  ).toBeVisible({
    timeout: 30_000,
  });
  await innerTab(page, 'Chat').click();
  await expect(
    page.getByRole('status').filter({ hasText: /Test the selected|Choose a model/ }),
  ).toHaveCount(0);
}

async function ask(page: Page, question: string) {
  await page.getByLabel('Your question').fill(question);
  await page.getByRole('button', { name: 'Ask' }).click();
  return page.getByRole('article', { name: `Answer to: ${question}` });
}

test.describe('US-09 / US-10: the local assistant on the real backend', () => {
  test('AC-43 / AC-50: a tested local model answers from the ride analytics, and the analytics used are shown', async ({
    page,
    ollama,
  }, testInfo) => {
    await page.goto('/');
    await uploadSampleExport(page);
    await assistantTab(page).click();

    // Nothing can be asked before a model is selected and tested (RULE-26).
    await expect(page.getByText(/Choose a model in the assistant settings first/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ask' })).toBeDisabled();

    await innerTab(page, 'Settings').click();
    await expect(page.getByText(/Connected to Ollama \(on this computer\) 0\.12\.6/)).toBeVisible();
    const model = page.getByRole('listitem', { name: 'qwen3:8b', exact: true });
    await expect(model).toContainText('8.2B · Q4_K_M · 5.2 GB · 40,960-token context');
    await expect(model).toContainText('Tool calling');
    await expect(model).toContainText('Not tested');
    await selectAndTestModel(page);
    if (testInfo.project.name === 'desktop-chromium') {
      await innerTab(page, 'Settings').click();
      await page.screenshot({
        path: testInfo.outputPath('assistant-settings.png'),
        fullPage: true,
      });
      await innerTab(page, 'Chat').click();
    }

    const question = 'How far did I ride in each month of 2023?';
    const answer = await ask(page, question);
    await expect(answer).toHaveAttribute('aria-busy', 'false', { timeout: 30_000 });

    // The answer's numbers equal the analytics result for the same question (AC-43, RULE-25).
    const months = await page.evaluate(async () => {
      const response = await fetch(
        '/api/analytics/distance-by-month?from=2023-01-01&to=2023-12-31',
      );
      return (
        (await response.json()) as { result: { year: number; month: number; distanceKm: number }[] }
      ).result;
    });
    expect(months.length).toBeGreaterThan(0);
    const expected = months
      .map(
        (m) =>
          `${m.year}-${String(m.month).padStart(2, '0')}: ${Math.round(m.distanceKm * 10) / 10} km`,
      )
      .join('; ');
    await expect(answer).toContainText(expected);
    await expect(answer.getByRole('list', { name: 'Analytics used' })).toContainText(
      'distance by month, 2023-01-01 – 2023-12-31',
    );
    await expect(answer).not.toContainText('Check this answer');
    if (testInfo.project.name === 'desktop-chromium') {
      await page.screenshot({ path: testInfo.outputPath('assistant-chat.png'), fullPage: true });
    }

    // The request to the model went through the real adapter, to Ollama's chat API.
    expect(ollama.fake.to('/api/chat').length).toBeGreaterThanOrEqual(2);
  });

  test('AC-54: the model receives analytics results only, never GPS points or ride IDs', async ({
    page,
    ollama,
  }) => {
    await page.goto('/');
    await uploadSampleExport(page);
    await assistantTab(page).click();
    await selectAndTestModel(page);
    ollama.fake.requests.length = 0; // only this question's requests

    const answer = await ask(page, 'How many of my rides passed within 200 m of 0.00000, 0.00000?');
    await expect(answer).toContainText('1 rides passed that place.', { timeout: 30_000 });
    await expect(answer.getByRole('list', { name: 'Analytics used' })).toContainText(
      'location visits',
    );

    const sent = JSON.stringify(ollama.fake.to('/api/chat').map((r) => r.body));
    expect(sent).toContain('visitCount');
    for (const forbidden of ['gpsTrack', '"points"', 'activityId', '"1001"', '"1002"', '"1003"']) {
      expect(sent).not.toContain(forbidden);
    }
  });

  test('AC-52: Stop ends the answer and closes the request to Ollama', async ({ page, ollama }) => {
    await page.goto('/');
    await assistantTab(page).click();
    await selectAndTestModel(page);
    ollama.fake.set({ chat: () => ({ hang: true }) });

    const answer = await ask(page, 'Tell me about all my rides.');
    await expect(answer).toContainText('Working on it…');
    await page.getByRole('button', { name: 'Stop' }).click();
    await expect(answer).toContainText('Stopped.');
    await expect.poll(() => ollama.aborted).toContain('/api/chat');

    // The conversation goes on.
    ollama.fake.set({
      chat: () => ({ lines: [{ message: { content: 'Still here.' }, done: true }] }),
    });
    await expect(await ask(page, 'Are you there?')).toContainText('Still here.');
  });

  test('AC-48 / AC-49: downloads a model with progress, then removes it after confirming', async ({
    page,
  }) => {
    await page.goto('/');
    await assistantTab(page).click();
    await innerTab(page, 'Settings').click();
    await page.getByLabel('Model name').fill('llama3.2');
    await page.getByRole('button', { name: 'Download' }).click();
    await expect(page.getByRole('listitem', { name: 'Download of llama3.2' })).toContainText(
      'Downloaded. Test it before asking.',
    );
    const llama = page.getByRole('listitem', { name: 'llama3.2:latest', exact: true });
    await expect(llama).toBeVisible();

    await llama.getByRole('button', { name: 'Remove llama3.2:latest' }).click();
    await llama.getByRole('button', { name: 'Remove model' }).click();
    await expect(page.getByText('llama3.2:latest was removed.')).toBeVisible();
    await expect(page.getByRole('listitem', { name: 'llama3.2:latest', exact: true })).toHaveCount(
      0,
    );
  });

  test('AC-51: a cloud model and an address on another computer are refused', async ({ page }) => {
    await page.goto('/');
    await assistantTab(page).click();
    await innerTab(page, 'Settings').click();

    await page.getByLabel('Model name').fill('gpt-oss:120b-cloud');
    await page.getByRole('button', { name: 'Download' }).click();
    await expect(page.getByText(/Cloud models run outside this computer/)).toBeVisible();

    const address = page.getByLabel('Ollama address');
    await address.fill('http://192.168.1.20:11434');
    await page.getByRole('button', { name: 'Save address' }).click();
    await expect(page.getByRole('alert')).toContainText('The address must be on this computer');
  });

  test('AC-46 / AC-53: without Ollama the assistant explains it, and the map and uploads keep working', async ({
    page,
    ollama,
  }) => {
    await ollama.close(); // Ollama is not running
    await page.goto('/');
    await assistantTab(page).click();
    await expect(page.getByText(/Ollama is not reachable/).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ask' })).toBeDisabled();

    await page.getByRole('tab', { name: 'Rides' }).click();
    await uploadSampleExport(page);
    await expect(page.getByRole('region', { name: 'Ride map' }).getByRole('status')).toHaveText(
      'Showing 3 rides on the map',
    );
  });
});

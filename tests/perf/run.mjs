/**
 * NFR-02 benchmark: how long a filter change takes to reach the screen (ADR-0006, 250 ms budget).
 *
 *   npm run perf                                  all synthetic scenarios, 2,000 rides each
 *   npm run perf -- --scenario explorer --rides 500
 *   npm run perf -- --zip path/to/export.zip      your own Strava export
 *   npm run perf -- --headed --budget 200
 *
 * Builds `tests/perf/harness`, serves it locally and drives it in Chromium (Playwright). Your export
 * is read from disk and handed to the page inside the test browser. Nothing is sent over the
 * network, and the base map is a blank local style. Exits with code 1 if any filter change takes
 * longer than the budget.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from '@playwright/test';
import { build, preview } from 'vite';

const SCENARIOS = ['random', 'explorer', 'commuter'];
const configFile = fileURLToPath(new URL('./vite.config.ts', import.meta.url));

const { values: args } = parseArgs({
  options: {
    scenario: { type: 'string', default: 'all' },
    rides: { type: 'string', default: '2000' },
    zip: { type: 'string' },
    budget: { type: 'string', default: '250' },
    headed: { type: 'boolean', default: false },
  },
});

const budgetMs = Number(args.budget);
const rides = Number(args.rides);
const scenarios = args.scenario === 'all' ? SCENARIOS : [args.scenario];
if (!args.zip && scenarios.some((name) => !SCENARIOS.includes(name))) {
  console.error(`Unknown scenario "${args.scenario}". Use one of: all, ${SCENARIOS.join(', ')}.`);
  process.exit(2);
}
if (!Number.isInteger(rides) || rides < 1 || !Number.isFinite(budgetMs) || budgetMs <= 0) {
  console.error('--rides must be a positive whole number and --budget a positive number of ms.');
  process.exit(2);
}

const write = (line = '') => process.stdout.write(`${line}\n`);
const pad = (value, width) => String(value).padStart(width);

write('Building the benchmark page…');
await build({ configFile });
const server = await preview({ configFile, preview: { port: 4310, strictPort: false } });
const url = server.resolvedUrls?.local[0];

// On Windows, ask Chromium for the real GPU (D3D11) so timings match a normal browser.
const gpuArgs = process.platform === 'win32' ? ['--use-angle=d3d11'] : [];
const browser = await chromium.launch({
  headless: !args.headed,
  args: ['--ignore-gpu-blocklist', '--enable-gpu', ...gpuArgs],
});

let overBudget = false;
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (error) => console.error(`Page error: ${error.message}`));
  await page.goto(url);
  await page.waitForFunction(() => document.title === 'ready');

  const runs = [];
  if (args.zip) {
    const zipPath = resolve(args.zip);
    const body = readFileSync(zipPath);
    await page.route('**/__perf-export.zip', (route) =>
      route.fulfill({ body, contentType: 'application/zip' }),
    );
    write(`Importing ${zipPath}…`);
    runs.push(() => page.evaluate(() => window.benchmark.zip('/__perf-export.zip')));
  } else {
    for (const name of scenarios) {
      runs.push(() =>
        page.evaluate(
          ([scenario, count]) => window.benchmark.synthetic(scenario, count),
          [name, rides],
        ),
      );
    }
  }

  for (const run of runs) {
    const result = await run();
    write();
    write(
      `${result.label}: ${result.rides.toLocaleString('en-US')} rides, ` +
        `${result.segments.toLocaleString('en-US')} road segments, ` +
        `index + geometry ${result.prepareMs.toLocaleString('en-US')} ms (once per import)`,
    );
    write(
      `  ${'filter change'.padEnd(22)}${pad('rides', 7)}${pad('count', 9)}${pad('to frame', 11)}`,
    );
    for (const step of result.steps) {
      const flag = step.frameMs > budgetMs ? '  over budget' : '';
      overBudget ||= flag !== '';
      write(
        `  ${step.name.padEnd(22)}${pad(step.rides, 7)}${pad(`${step.aggregateMs} ms`, 9)}` +
          `${pad(`${step.frameMs} ms`, 11)}${flag}`,
      );
    }
    if (/swiftshader|llvmpipe|software/i.test(result.renderer)) {
      write(`  Note: software rendering (${result.renderer}); timings overstate a real GPU.`);
    } else {
      write(`  GPU: ${result.renderer}`);
    }
  }
} finally {
  await browser.close();
  await new Promise((done) => server.httpServer.close(done));
}

write();
write(
  overBudget
    ? `FAIL: at least one filter change took longer than ${budgetMs} ms (NFR-02).`
    : `PASS: every filter change reached the screen within ${budgetMs} ms (NFR-02).`,
);
process.exitCode = overBudget ? 1 : 0;

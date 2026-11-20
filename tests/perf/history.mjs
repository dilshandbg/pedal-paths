/**
 * NFR-10 benchmark: the stored ride history (BRD v2.3, ADR-0013).
 *
 *   npm run perf:history                          2,000 synthetic rides (commuter scenario)
 *   npm run perf:history -- --rides 500 --scenario explorer
 *   npm run perf:history -- --headed
 *
 * 1. Stores a seeded SYNTHETIC history in a temporary ride database, through the real repository.
 * 2. Times location-visit queries (100 m, RULE-24) at ten places on the stored routes, through the
 *    real backend analytics. Budget: 500 ms each.
 * 3. Builds the real app, serves it with `vite preview` on that database, and times five cold
 *    page loads in Chromium until the map shows every stored ride. Budget: a median of 5 s. A
 *    single slower load is reported but not failed: one load on a busy machine is noise.
 *
 * Nothing is sent over the network: the base map is a blank local style and the database is
 * deleted afterwards. Exits with code 1 if a budget is exceeded.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from '@playwright/test';
import { build, createServer, preview } from 'vite';

const SCENARIOS = ['random', 'explorer', 'commuter'];
/** Cold page loads timed for the restore budget; judged on their median. */
const RESTORE_RUNS = 5;
const root = fileURLToPath(new URL('../..', import.meta.url));

const { values: args } = parseArgs({
  options: {
    scenario: { type: 'string', default: 'commuter' },
    rides: { type: 'string', default: '2000' },
    'restore-budget': { type: 'string', default: '5000' },
    'query-budget': { type: 'string', default: '500' },
    headed: { type: 'boolean', default: false },
  },
});

const rides = Number(args.rides);
const restoreBudgetMs = Number(args['restore-budget']);
const queryBudgetMs = Number(args['query-budget']);
if (!SCENARIOS.includes(args.scenario)) {
  console.error(`Unknown scenario "${args.scenario}". Use one of: ${SCENARIOS.join(', ')}.`);
  process.exit(2);
}
if (!Number.isInteger(rides) || rides < 1 || !(restoreBudgetMs > 0) || !(queryBudgetMs > 0)) {
  console.error('--rides must be a positive whole number and the budgets positive numbers of ms.');
  process.exit(2);
}

const write = (line = '') => process.stdout.write(`${line}\n`);
const ms = (value) => `${Math.round(value).toLocaleString('en-US')} ms`;

const dir = mkdtempSync(join(tmpdir(), 'pedal-paths-history-'));
const databasePath = join(dir, 'rides.sqlite');
let failed = false;

try {
  // --- 1. A synthetic stored history ------------------------------------------------------------
  // Vite loads the TypeScript modules, as it does for the local backend. No config file: no app
  // plugins or servers are started.
  const loader = await createServer({
    configFile: false,
    root,
    logLevel: 'silent',
    resolve: { alias: { '@': resolve(root, 'src') } },
    server: { middlewareMode: true, hmr: false, watch: null },
    appType: 'custom',
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  let scenarios, codec, repositories, analyticsLib;
  try {
    scenarios = await loader.ssrLoadModule('/tests/perf/harness/scenarios.ts');
    codec = await loader.ssrLoadModule('/src/services/ride-history/trackCodec.ts');
    repositories = await loader.ssrLoadModule('/server/rides/rideRepository.ts');
    analyticsLib = await loader.ssrLoadModule('/server/analytics/rideAnalytics.ts');
  } finally {
    await loader.close();
  }

  write(`Storing ${rides.toLocaleString('en-US')} synthetic rides (${args.scenario})…`);
  const activities = scenarios.buildScenario(args.scenario, rides);
  const pointCount = activities.reduce((sum, a) => sum + a.gpsTrack.length, 0);
  const repository = repositories.openRideRepository(databasePath);
  let started = performance.now();
  repository.importUpload({
    upload: {
      fileName: 'synthetic.zip',
      fileSizeBytes: 0,
      fileHash: '0'.repeat(64),
      skippedCount: 0,
      excludedNonRideCount: 0,
    },
    rides: activities.map((activity, index) => ({
      details: {
        activityId: activity.activityId,
        activityName: activity.activityName,
        // One ride a day, so date ranges and months are meaningful.
        activityDate: new Date(Date.UTC(2019, 0, 1, 8) + index * 86_400_000).toISOString(),
        distanceKm: null,
        elevationGainM: null,
        movingTimeS: null,
      },
      track: codec.encodeTrack(activity.gpsTrack),
      points: activity.gpsTrack,
    })),
  });
  write(
    `  ${pointCount.toLocaleString('en-US')} GPS points stored in ${ms(performance.now() - started)}`,
  );

  // --- 2. Location-visit queries ----------------------------------------------------------------
  const analytics = analyticsLib.createRideAnalytics(repository, 'UTC');
  const all = { from: null, to: null };
  // Ten places on the stored routes, spread over the history: busy roads and quiet ones.
  const places = Array.from({ length: 10 }, (_, k) => {
    const track = activities[Math.floor((k * activities.length) / 10)].gpsTrack;
    const { latitude, longitude } = track[Math.floor(track.length / 2)];
    return { latitude, longitude };
  });
  analytics.locationVisits({ ...places[0], radiusM: 100, range: all }); // warm up

  write();
  write(`Location visits, 100 m (NFR-10 budget ${ms(queryBudgetMs)})`);
  write(`  ${'place'.padEnd(24)}${'visits'.padStart(8)}${'time'.padStart(10)}`);
  for (const place of places) {
    started = performance.now();
    const result = analytics.locationVisits({ ...place, radiusM: 100, range: all });
    const elapsed = performance.now() - started;
    const flag = elapsed > queryBudgetMs ? '  over budget' : '';
    failed ||= flag !== '';
    const label = `${place.latitude.toFixed(4)}, ${place.longitude.toFixed(4)}`;
    write(
      `  ${label.padEnd(24)}${String(result.visitCount).padStart(8)}${ms(elapsed).padStart(10)}${flag}`,
    );
  }
  started = performance.now();
  const wide = analytics.locationVisits({ ...places[0], radiusM: 2000, range: all });
  write(
    `  For information, 2 km at the first place: ${wide.visitCount} visits in ${ms(performance.now() - started)} (no budget)`,
  );
  repository.close();

  // --- 3. Restore in the real app ---------------------------------------------------------------
  write();
  write('Building the app…');
  process.env.RIDES_DB_PATH = databasePath;
  process.env.SEGMENT_CATALOG_PATH = ':memory:';
  process.env.SEGMENTS_DB_PATH = ':memory:';
  const configFile = join(root, 'vite.config.ts');
  await build({ configFile, logLevel: 'warn' });
  const server = await preview({ configFile, logLevel: 'warn', preview: { port: 4320 } });
  const url = server.resolvedUrls?.local[0];

  const gpuArgs = process.platform === 'win32' ? ['--use-angle=d3d11'] : [];
  const browser = await chromium.launch({
    headless: !args.headed,
    args: ['--ignore-gpu-blocklist', '--enable-gpu', ...gpuArgs],
  });
  try {
    write(
      `Restore and show ${rides.toLocaleString('en-US')} stored rides (NFR-10 budget: median ${ms(restoreBudgetMs)})`,
    );
    const loads = [];
    const shown = `Showing ${rides.toLocaleString('en-US')} rides on the map`;
    for (let run = 1; run <= RESTORE_RUNS; run += 1) {
      // A fresh browser context each time: a cold start, nothing cached.
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      await context.route('https://tiles.openfreemap.org/**', (route) =>
        route.fulfill({
          json: {
            version: 8,
            sources: {},
            layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#e2e8f0' } }],
          },
        }),
      );
      const page = await context.newPage();
      page.on('pageerror', (error) => console.error(`Page error: ${error.message}`));
      await page.goto(url);
      await page.getByText(shown).waitFor({ timeout: 120_000 });
      // Milliseconds since the navigation started: page load, history request, decode, index.
      const elapsed = await page.evaluate(() => performance.now());
      loads.push(elapsed);
      const slow = elapsed > restoreBudgetMs ? '  slower than the budget' : '';
      write(`  run ${run}: ${ms(elapsed).padStart(9)}${slow}`);
      await context.close();
    }
    const sorted = [...loads].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    failed ||= median > restoreBudgetMs;
    write(
      `  median ${ms(median)}, fastest ${ms(sorted[0])}, slowest ${ms(sorted[sorted.length - 1])}` +
        (median > restoreBudgetMs ? '  over budget' : ''),
    );
  } finally {
    await browser.close();
    await new Promise((done) => server.httpServer.close(done));
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}

write();
write(
  failed
    ? 'FAIL: at least one measurement was over its NFR-10 budget.'
    : 'PASS: the history restored and location queries answered within the NFR-10 budgets.',
);
process.exitCode = failed ? 1 : 0;

/**
 * Download segment details and routes from Strava into an upload file (BRD v2.2 BR-31, ADR-0012).
 *
 *   npm run fetch-segments                          IDs from the segment catalog
 *   npm run fetch-segments -- 27580806 35710081     these IDs
 *   npm run fetch-segments -- --from my-file.json   IDs from a catalog or upload file
 *   npm run fetch-segments -- --out data/x.json     output file (default data/strava-segments.json)
 *
 * Needs STRAVA_ACCESS_TOKEN in the environment or in .env.local: the access token shown at
 * https://www.strava.com/settings/api (read access, valid for 6 hours). The token is sent only to
 * the Strava API and never printed or saved. The app itself never contacts Strava: upload the
 * written file in the Segments tab, where you review it before anything is stored.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, loadEnv } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const env = loadEnv('development', root, ['STRAVA_', 'SEGMENT_']);
const token = (process.env.STRAVA_ACCESS_TOKEN ?? env.STRAVA_ACCESS_TOKEN ?? '').trim();
const catalogPath = resolve(
  root,
  (process.env.SEGMENT_CATALOG_PATH ?? env.SEGMENT_CATALOG_PATH ?? '').trim() ||
    'data/segment-catalog.json',
);

const fail = (message) => {
  console.error(message);
  process.exit(1);
};

// Vite loads the TypeScript module, as it does for the local backend. No config file: nothing else
// (no app plugins, no server) is started.
const vite = await createServer({
  configFile: false,
  root,
  logLevel: 'silent',
  server: { middlewareMode: true, hmr: false, watch: null },
  appType: 'custom',
  optimizeDeps: { noDiscovery: true, include: [] },
});
let lib;
try {
  lib = await vite.ssrLoadModule('/server/strava/fetchSegments.ts');
} finally {
  await vite.close();
}

const args = lib.parseFetchArguments(process.argv.slice(2));
if (args.errors.length > 0) fail(args.errors.join('\n'));
if (!token) {
  fail(
    'STRAVA_ACCESS_TOKEN is not set. Copy the access token from https://www.strava.com/settings/api\n' +
      'into .env.local as STRAVA_ACCESS_TOKEN=... (never commit it), then run this again.',
  );
}

let segmentIds = args.segmentIds;
if (segmentIds.length === 0) {
  const source = args.from ? resolve(process.cwd(), args.from) : catalogPath;
  if (!existsSync(source)) fail(`No segment IDs given, and ${source} does not exist.`);
  try {
    segmentIds = lib.segmentIdsFromFile(JSON.parse(readFileSync(source, 'utf8')));
  } catch {
    fail(`${source} is not valid JSON.`);
  }
  if (segmentIds.length === 0) fail(`${source} lists no segment IDs.`);
  console.log(`Segment IDs from ${source}`);
}

console.log(`Downloading ${segmentIds.length} segment(s) from Strava…`);
const result = await lib.fetchStravaSegments(segmentIds, token, (url, init) => fetch(url, init), {
  pauseMs: 250,
  onProgress: (message) => console.log(`  ${message}`),
});
for (const { segmentId, reason } of result.failures) console.warn(`  ${segmentId}: ${reason}`);
if (result.stopped) console.warn(result.stopped);

if (result.segments.length === 0) fail('Nothing was downloaded; no file written.');
const out = resolve(process.cwd(), args.out ?? resolve(root, 'data/strava-segments.json'));
mkdirSync(dirname(out), { recursive: true });
writeFileSync(`${out}.tmp`, lib.toImportFile(result), 'utf8');
renameSync(`${out}.tmp`, out);
console.log(
  `Wrote ${result.segments.length} segment(s) to ${out}.\n` +
    'Upload it in the Segments tab: you review it, then it updates the segments by ID.',
);
if (result.stopped || result.failures.length > 0) process.exitCode = 1;

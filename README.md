# Strava Cycling Heat Map

A personal, local web app that turns your **original Strava export ZIP** into an interactive heat
map of your rides. It shows how often each road was ridden, filtered by year, month and individual
ride. You can also import details of Strava segments you care about from a file, browse your
efforts and personal bests, and see the segments on the same map. Rides are processed in your
browser; segments are stored in a local JSON catalog file. Nothing leaves your machine, and the app never
connects to Strava.

## Status

All requirements in [`docs/BRD.md`](docs/BRD.md) v2.0 are implemented and verified by automated
tests. See [`docs/traceability.md`](docs/traceability.md) for the requirement-by-requirement
matrix.

- **Import:** upload the original Strava export ZIP (checked first: a `.zip`, at most 5 GB). It is processed in a background Web Worker,
  with progress and a summary of loaded, excluded and skipped activities. Only **Ride** activities
  with GPX or FIT tracks are kept.
- **Heat map:** roads are coloured and sized by how many different rides used them, from 1 ride
  to the busiest road, with a legend. The base map is MapLibre + OpenStreetMap with pan and zoom.
- **Filters:** years, months (combined, e.g. November across several years) and individual rides.
  An active-filters summary and a reset button sit above them. The map updates instantly, with no
  page reload.
- **Details and statistics:** each ride shows its date, distance and elevation gain. A statistics
  panel shows the ride count, total distance, total elevation gain, total moving time and
  average distance per ride for the current filter.
- **Segments:** a Segments tab imports segment details from a JSON, GeoJSON or CSV file you
  prepare. Every record is validated, you review what is new or updated before confirming, and
  re-importing updates segments instead of duplicating them. Search, filter by distance, sort,
  open a segment to see its effort history with the personal best marked, show the routes on the
  map, and remove one segment or all segment data. Segments are kept in a local JSON catalog with
  their routes and altitude and distance samples.
- **Performance:** a filter change reaches the screen in 27–121 ms for 2,000 synthetic rides
  (budget 250 ms, NFR-02). Re-measure with `npm run perf`.

Still open: confirming that performance with a real export (`npm run perf -- --zip <export>`), and
the provisional size limits (OD-24). The alternative visualization modes in BRD §9 are deferred
(OD-18).

## Tech stack

React 19 · TypeScript (strict) · Vite 6 · Tailwind CSS 4 · Zustand · MapLibre GL JS +
OpenStreetMap tiles · deck.gl · fflate · @garmin/fitsdk · a local JSON segment catalog (Node's built-in `node:sqlite` only to migrate older data) · Vitest + React Testing Library · Playwright · ESLint · Prettier

## Prerequisites

- **Node.js 22.13+** (needed for the built-in SQLite module; see `.nvmrc`) and npm 10+
- An internet connection for map tiles. **No API key or billing account is needed.**

## Getting started

```bash
npm install
npm run dev                         # http://localhost:5173
```

`npm run dev` (and `npm run build && npm run preview`) also serves the local segment API at
`/api/segments`. It only answers requests from your own machine. Serving `dist/` with any other
static file server works for rides, but the Segments tab then reports that segment storage is
unavailable.

## Configuration

Nothing needs configuring: there are no API keys or secrets. Optional settings go in
`.env.local` (copy `.env.example`; `.env.local` is git-ignored):

| Variable               | Default                                        | Purpose                                          |
| ---------------------- | ---------------------------------------------- | ------------------------------------------------ |
| `VITE_MAP_STYLE_URL`   | `https://tiles.openfreemap.org/styles/liberty` | MapLibre style for the base map                  |
| `SEGMENT_CATALOG_PATH` | `data/segment-catalog.json`                    | Segment catalog file (`:memory:` keeps nothing)  |
| `SEGMENTS_DB_PATH`     | `data/segments.sqlite`                         | Older SQLite database, migrated once (see below) |

Restart the dev or preview server after changing them.

## Map tiles

The base map is MapLibre GL JS with free OpenStreetMap tiles from
[OpenFreeMap](https://openfreemap.org/). It needs no key, no account and no billing (ADR-0008).
To use a different MapLibre-compatible style, copy `.env.example` to `.env.local` and set:

```dotenv
VITE_MAP_STYLE_URL=https://example.org/your-style.json
```

Restart `npm run dev` after changing env files. Map attribution (© OpenStreetMap
contributors) stays visible on the map, as the tile licence requires.

## Scripts

| Command                    | Description                                            |
| -------------------------- | ------------------------------------------------------ |
| `npm run dev`              | Start the Vite dev server                              |
| `npm run build`            | Type-check and build for production into `dist/`       |
| `npm run preview`          | Serve the production build locally                     |
| `npm run test`             | Run unit and integration tests (Vitest)                |
| `npm run test:watch`       | Run Vitest in watch mode                               |
| `npm run test:e2e:install` | Download the Playwright Chromium browser (run once)    |
| `npm run test:e2e`         | Run Playwright end-to-end tests                        |
| `npm run lint`             | Lint with ESLint                                       |
| `npm run typecheck`        | Type-check with `tsc -b`                               |
| `npm run format`           | Format with Prettier                                   |
| `npm run perf`             | Time filter changes against the 250 ms budget (NFR-02) |

`npm run test` includes the backend tests in `tests/server` (catalog in memory and in temporary files). `npm run test:e2e`
starts `vite preview` with an in-memory segment catalog, so it never touches your data.

## Project structure

```text
docs/          BRD (source of truth), architecture, technical design, ADRs, traceability,
               segment import and catalog formats
public/        Static assets
server/        Local backend: JSON segment catalog, SQLite migration, /api/segments, Vite plugin
data/          segment-catalog.json with your imported segments (git-ignored)
src/
  app/         App root, routes, providers
  components/  Presentational UI (layout, map, filters, statistics, segments, common)
  features/    activities · filters · heatmap · segments: feature modules (logic + containers)
  services/    strava-export (ZIP + CSV), gpx, fit, map config, segments-api client
  store/       Cross-feature state
  types/       Domain model
  utils/       Generic helpers
  styles/      Tailwind entry
tests/         unit · integration · server · e2e · fixtures (synthetic)
test-data/     Your real exports for manual testing (git-ignored)
.claude/       Claude Code rules and commands
```

See [`docs/architecture.md`](docs/architecture.md) for the layering and dependency rules.

## Loading your activity data

1. In Strava, go to **Settings → My Account → Download or delete your account → Request your
   archive**. Strava emails you a link to a ZIP file.
2. Start the app (`npm run dev`) and select that ZIP with the upload control. **Don't extract
   it.** The app reads `activities.csv` and the `activities/` GPX and FIT files directly from
   the archive.
3. Only activities classified as **Ride** are shown. Runs, swims, workouts and other types
   (including Virtual, E-Bike, Gravel and Mountain Bike rides) are excluded.
4. To switch datasets, select a different ZIP. Data is not kept after a page reload.

> Processing runs in a background Web Worker, so the page stays responsive even for large exports.
> You get a summary of rides loaded, non-ride activities excluded, and any rides that could not be
> processed (for example indoor rides without GPS, or TCX files).

Keep your own export in `test-data/`, which is git-ignored for privacy.

## Segments

The app does not connect to Strava. You prepare a file with the segments you want and upload it
in the **Segments** tab. The format is specified in
[`docs/segment-import-format.md`](docs/segment-import-format.md); field names follow the Strava
API, so a segment object copied from Strava usually works as-is. Add Strava `streams`
(`latlng`, `altitude`, `distance`) to a segment to store its altitude and distance samples too.

1. Open the **Segments** tab and choose a `.json`, `.geojson` or `.csv` file (at most 20 MB).
2. If anything is wrong, every problem is listed with its record and field, and nothing is
   stored. Fix the file and choose it again.
3. Otherwise review the segments, each marked **New**, **Update** or **Unchanged**, then
   **Confirm import**, or **Cancel** to store nothing.
4. Uploading a newer file later updates the segments with the same Strava segment ID and adds
   only efforts that are not stored yet. Fields missing from the new file keep their stored values.
5. Search, filter by distance and sort the list; open a segment for its details and effort
   history. Segment routes are drawn in blue on the map: click one to open it, or untick
   **Show segments on the map**. Segments never change the ride heat map or statistics.

An efforts-only CSV (`segment_id,start_date,elapsed_time_s,…`) adds efforts to segments that are
already stored.

## Where your data is and how to remove it

- **Rides** are read from the ZIP in your browser and kept in memory only. Reloading the page or
  closing the tab removes them. The app never uploads them.
- **Segments** are stored in `data/segment-catalog.json` in the project folder (or at
  `SEGMENT_CATALOG_PATH`), with their routes, altitude and distance samples, and efforts
  ([format](docs/segment-catalog-format.md)). The app loads the catalog when it starts. Segments only
  travel between your browser and the local server on your machine.
- **Upgrading from SQLite:** if you used an earlier version, your segments are in
  `data/segments.sqlite`. On the first start without a catalog file, the app copies all of them
  into the catalog, checks the copy, and renames the database to `segments.sqlite.migrated`. That
  file is no longer used; delete it once you have checked your segments.

To remove segment data:

- **In the app:** open a segment and choose **Remove segment**, or choose **Remove all segment
  data** under the list. Both ask for confirmation.
- **On disk:** stop the app and delete `data/segment-catalog.json`, and any
  `segments.sqlite.migrated` file. This removes all segment data. If an old `data/segments.sqlite`
  is still there, delete it too; otherwise it is migrated again on the next start.

There is no Strava connection to disconnect: the app has no Strava login and stores no tokens.

## Performance check

`npm run perf` measures how long a filter change takes to reach the screen (NFR-02, 250 ms
budget). It runs the real heat map code in Chromium and exits with code 1 if any change is too slow.

```bash
npm run perf                                       # 3 synthetic datasets, 2,000 rides each
npm run perf -- --zip test-data/export_12345.zip   # your own Strava export
npm run perf -- --scenario explorer --rides 500 --budget 200 --headed
```

Your export is read from disk into a local test browser. Nothing is uploaded, and the base map is a
blank local style. Run it on the machine you use the app on: timings depend on its GPU.

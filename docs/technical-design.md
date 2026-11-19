# Technical Design

> Status: **Accepted**, aligned with `docs/BRD.md` **v2.0** (2026-11-15). The decisions are
> recorded as ADRs in `docs/decisions/`. Requirement IDs are listed in `docs/traceability.md`.

## 1. Scope of the scaffold

What exists now:

- Application shell: header, filter panel placeholder, map placeholder, statistics panel placeholder.
- Domain types in `src/types`, accepted against BRD v1.1.
- Filter store (state only).
- **ZIP upload and import** (BR-01–05, BR-16): upload panel, Web Worker import pipeline, progress,
  loaded/excluded/skipped summary, clear errors.
- **Interactive map** (BR-06): MapLibre + OpenFreeMap base map with pan/zoom controls; loaded rides
  drawn by deck.gl, view fitted to the rides.
- **Traversal-frequency heat map** (BR-12): segment index built in the import worker; per-selection
  aggregation counts distinct rides per ~25 m road segment; log-scaled colour and width; legend
  (ADR-0006 amendment).
- **Year filter** (BR-07): checklist of the years in the export, newest first, with "All years"
  checked while none is selected (ADR-0005). The ride list shows only rides in the selected years.
- **Month filter** (BR-08): January–December checklist with "All months"; combines with the
  years as a Cartesian AND (AC-10). The ride list shows only rides in the selected period.
- **Combined filters** (BR-11): one pure `filterActivities` applies years × months, minus
  deselected rides (RULE-08). An "Active filters" summary lists the selected years, months and the
  number of deselected rides (UX-06).
- **Reset filters** (BR-15): "Reset filters" button in the Active filters summary clears years,
  months and ride exclusions; disabled while nothing is filtered.
- **Statistics** (BR-14, BR-19, UX-08): ride count, total distance (km), total elevation gain
  (m), total moving time and average distance per ride of the filtered rides. Moving time comes
  from the `Moving Time` column of `activities.csv`. Unknown values are left out of the totals,
  and a value nobody has is shown as "Not available" (RULE-13, ADR-0007).
- **ZIP validation** (BR-17): `.zip` name or ZIP MIME type and at most 5 GB, checked before the
  worker starts (OD-24 for the limit).
- **Duplicate rides** (BR-18): the first `activities.csv` row per Activity ID wins; a new ZIP
  replaces the dataset.
- **Segments** (BR-20 – BR-28, ADR-0009, ADR-0010): see §7a.
- **Activity details** (BR-13): each ride in the ride list shows its name, local date and, when
  known, distance (km) and elevation gain (m).
- **Dynamic heat map** (BR-10): filter changes re-derive the selection and replace the deck.gl
  layer on the existing map; no reload, no map re-creation (AC-11, RULE-11).
- **Ride filter** (BR-09): checkbox list of the loaded rides (name and local date); deselected
  rides are kept in `excludedActivityIds` and drop out of the heat map. The view stays fitted to
  the whole dataset, so toggling rides does not move the map.
- Generic utilities: haversine distance, coordinate validation, month guard.
- Map style configuration helper (`services/map`).
- Tooling: TypeScript strict, ESLint with architecture boundary rules, Prettier, Vitest + RTL, Playwright.

All BRD v2.0 requirements are implemented and verified (see `docs/traceability.md`). Still
worth doing: re-measure NFR-02 with a real Strava export, and confirm the OD-24 limits.

## 2. Technology stack

| Concern         | Choice                                                                      | Decision              |
| --------------- | --------------------------------------------------------------------------- | --------------------- |
| UI              | React 19 + TypeScript (strict)                                              | Project brief         |
| Build           | Vite 6                                                                      | Project brief         |
| Styling         | Tailwind CSS 4                                                              | Project brief         |
| State           | Zustand 5                                                                   | Project brief, BRD §8 |
| Base map        | MapLibre GL JS + OpenFreeMap (OSM) tiles                                    | ADR-0008              |
| Route rendering | deck.gl 9 `LineLayer` + `ScatterplotLayer` via `MapboxOverlay`              | ADR-0006, ADR-0008    |
| ZIP + gunzip    | `fflate`                                                                    | ADR-0004              |
| FIT parsing     | `@garmin/fitsdk`                                                            | ADR-0004              |
| GPX parsing     | Local text scanner (no library)                                             | ADR-0004 amendment    |
| CSV parsing     | Local pure parser                                                           | ADR-0004              |
| Background work | Web Worker (Vite `?worker` import)                                          | ADR-0004              |
| Local backend   | Node 22.13+ middleware on the Vite dev / preview server                     | ADR-0009              |
| Segment storage | JSON catalog file written by the local backend; SQLite read once to migrate | ADR-0011              |
| Segment overlay | deck.gl 9 `PathLayer` (casing + line) above the heat map                    | ADR-0010              |
| Testing         | Vitest 4 + jsdom + RTL; Playwright                                          | Project brief         |

## 3. Domain model (`src/types`)

| Type                              | Purpose                                                                                            |
| --------------------------------- | -------------------------------------------------------------------------------------------------- |
| `CyclingActivity`                 | One normalized Ride. `distanceKm` / `elevationGainM` are nullable ("when available", BR-13)        |
| `GPSPoint`                        | Track sample. `elevation` / `timestamp` are nullable                                               |
| `ActivityFilter`                  | `selectedYears`, `selectedMonths` (opt-in, empty = all), `excludedActivityIds` (opt-out)           |
| `HeatMapData`                     | `paths[]` with `coordinates`, `frequency`, `intensity`, `activityIds`; `maxFrequency`              |
| `ActivitySummary`                 | `activityCount`, `totalDistanceKm`, `totalElevationGainM`, `totalMovingTimeS`, `averageDistanceKm` |
| `SegmentRecord`                   | One imported segment: Strava ID, name, figures, location, start/end, route, stated PR              |
| `SegmentEffortRecord`             | One effort: segment ID, optional effort/activity ID, UTC start, elapsed and moving time            |
| `SegmentImportPayload`            | A validated import: source file name, segments, efforts (what the browser sends)                   |
| `SegmentImportPlan`               | Per segment `new` / `update` / `unchanged`, changed fields, new effort counts                      |
| `StoredSegment` / `SegmentDetail` | A stored segment with timestamps and personal best; with its efforts                               |
| `SegmentOverlayData`              | Render-ready segment paths (`[lng, lat]`) and the selected segment ID                              |
| `ImportResult`                    | Success (`activities`, `issues`, `excludedNonRideCount`) or failure (`reason`)                     |
| `ImportIssue`                     | A non-fatal, per-activity problem (UX-04)                                                          |
| `ImportStatus`                    | Progress stages for the UI (UX-02)                                                                 |

Conventions:

- Every domain object is `readonly`.
- Dates are UTC ISO strings; `year` and `month` are derived in local time.
- Months run 1–12.
- Render coordinates use `[lng, lat]`.

## 4. Ingestion pipeline (ADR-0004, ADR-0007)

```text
File (.zip)
  └─▶ [Web Worker]
        readStravaArchive      services/strava-export   fflate streaming; reads only activities.csv + activities/*
        parseActivitiesCsv     services/strava-export   RFC 4180; resolves columns by position
        classifyActivities     features/activities/services   Activity Type == 'Ride'
        associateGpsFiles      services/strava-export   via the Filename column; gunzips .gz files
        parseGpx / parseFit    services/gpx, services/fit
        normalizeActivity      features/activities/services   → CyclingActivity | ImportIssue
        precomputeSegments     features/heatmap/services      snapped segment sets per activity (ADR-0006)
  ◀── progress events (ImportStatus), final ImportResult
```

- One bad activity produces an `ImportIssue`. Only archive-level problems are fatal.
- A failed load keeps the previous dataset. A successful load replaces it and resets the filters
  (BR-16, AC-15).

## 5. Filtering (ADR-0005)

The pure `matchesFilter(activity, filter)` / `applyFilter(activities, filter)` functions live in
`features/filters/utils`:

- years and months: opt-in, empty means unrestricted, combined as a Cartesian AND;
- rides: an exclusion list.

The filtered set, the count, the summary and the heat map data are all derived from these and
never stored.

## 6. Heat map (ADR-0006)

- Tracks are snapped to a ~25 m grid.
- Each activity is represented by a set of segment edges, computed once at import.
- Drawing geometry (segment and cell positions) is built once per dataset.
- On a filter change, only the per-segment count of **distinct activities** is recomputed
  (typed arrays), with `intensity = log(1 + f) / log(1 + max)`.
- Rendering uses a deck.gl `LineLayer` (segments) and `ScatterplotLayer` (joints) with binary
  attributes. Positions are shared buffers, so only colours and widths are uploaded.
- Target: about 2,000 rides, filter updates under 250 ms. Measured at 34–169 ms (ADR-0006).

## 7. State management

| Store                                       | Holds                                                                                                             |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `features/filters/store/filterStore`        | `ActivityFilter`                                                                                                  |
| `features/activities/store/activitiesStore` | Loaded `CyclingActivity[]`, segment index, `ImportStatus`, `ImportIssue[]`                                        |
| `features/segments/store/segmentsStore`     | Stored segments as last loaded, storage status, import state, selected segment and its detail, overlay visibility |

The segment list's search, distance range and sort order are local UI state of `SegmentsSection`.

## 6b. Map style (owner-approved, pending BRD entry: OD-27)

- **Base maps:** `getBaseMapOptions` offers OpenFreeMap `liberty` (Colourful, default), `positron`
  (Light grey) and `dark` (Dark), each with a `light`/`dark` theme; a valid `VITE_MAP_STYLE_URL` is
  added first as "Custom" (assumed light) and becomes the default.
- **Switching:** `MapView` creates the map once and applies a new style with `map.setStyle`, so the
  view, the deck.gl overlay (a separate canvas) and the data stay. The choice lives in
  `features/heatmap/store/mapStyleStore` and is saved under `strava-heatmap:base-map` in
  localStorage (ID only; unknown IDs fall back to the default; blocked storage just means it is not
  remembered).
- **Heat colours:** a **Heat colours** menu offers `magenta-purple` (default: pink → magenta → deep
  magenta → dark purple, hues the base map's yellow and orange roads don't use) and `fire` (the
  original light orange → deep red). On light maps each ramp darkens with intensity; on the dark
  map it is reversed (magenta–purple's darkest stop lifted to violet) so the busiest roads are
  lightest. Width still grows with intensity, so colour is never the only signal (AC-12). Saved
  under `strava-heatmap:heat-palette`, like the base map.

## 7a. Segments (ADR-0009, ADR-0010, ADR-0011)

- **Import format:** `docs/segment-import-format.md`. JSON (Strava field names), GeoJSON
  FeatureCollection, segments CSV or efforts CSV; at most 20 MB (OD-24).
- **Parsing** runs in a Web Worker (`segmentFileWorker`): `parseSegmentFile` maps each format to
  the normalized payload and reports problems in the file's own terms ("row 4", "segment 2 (ID 7)",
  `distance`). Encoded polylines are decoded with the precision-5 algorithm (`utils/polyline`).
  Strava `streams` (`latlng`, `altitude`, `distance`) and a third GeoJSON coordinate give the
  altitude and distance samples (BR-29); the `latlng` stream is the route they are aligned with.
- **Validation** (`validateSegmentPayload`) runs in the browser and again on the server: IDs are
  digit strings, numbers are finite and in range, dates are real calendar dates or ISO date-times
  with a zone (normalized to UTC), coordinates are valid, routes have 2 – 100,000 points, samples have one value per route point (distances never
  decreasing, RULE-19), IDs are
  unique within an import, efforts reference a segment in the import or already stored. Every
  problem is reported; nothing is stored if any exists (RULE-15).
- **Plan and merge** (`planSegmentImport`, `mergeSegment`): a segment is `new`, an `update` (it
  changes a stored field or adds efforts) or `unchanged`. On update, values in the new file replace
  stored ones and absent (null) values keep them; efforts are only added, identified by effort ID,
  or by UTC start time and elapsed time (RULE-16).
- **Storage** (ADR-0011, `server/catalog`): the JSON segment catalog
  (`docs/segment-catalog-format.md`), loaded and validated on the first API request and kept
  in memory. Each change is planned against the current catalog, written to a temporary file that
  is renamed over the catalog, and applied in memory only after the write succeeded. A file that is
  not a catalog is never loaded or overwritten (`storage-unavailable`); within a catalog, invalid
  fields become unknown and invalid entries are skipped, with warnings and a `.bak` of the
  original before the first rewrite. Distances are kept to the millimetre (`distanceKm` in the file). A new route without samples clears
  the stored samples (RULE-19).
- **Migration** (BR-30, `migrateLegacyDatabase`): when the catalog file is missing and a v2.0
  SQLite database exists, its segments are copied into the catalog, the file is read back and
  compared, and the database is renamed to `segments.sqlite.migrated`. The legacy schema is in
  `docs/implementation-plan-v2.md` §2.
- **Personal best** (RULE-17): fastest stored effort, earliest on a tie (`personalBest`); otherwise the PR stated in the file.
- **Map overlay** (BR-26, AC-33): `buildSegmentOverlay` turns stored routes into `[lng, lat]`
  paths. A segment without a route becomes start and end markers (filled dot, ring), never a
  straight line; `segmentLayer` draws them as blue lines with a white
  casing above the heat map. The selected segment is wider and darker and drawn last. A click
  selects a segment and opens its details; selecting one in the list fits the map to it. The
  overlay depends only on segment state (RULE-18).
- **Statistics** (RULE-20, `segmentStatistics`): values stated in the file are shown as given; a
  missing one is computed from the samples and marked "(from route samples)": elevation gain = sum
  of rises, average grade = net rise / distance, maximum grade = steepest stretch of at least
  `MAX_GRADE_WINDOW_M` (100 m; the whole segment if shorter), range = lowest/highest altitude
  sample, distance = last distance sample. Otherwise "Not available".
- **Download command** (BR-31, ADR-0012): `npm run fetch-segments` fetches `/segments/{id}` and
  its `latlng,altitude,distance` streams with `STRAVA_ACCESS_TOKEN` and writes an upload file.
  Not part of the app; tests use mocked responses.
- **Security (NFR-07, NFR-08):** answers loopback peers only; rejects a foreign `Origin` or
  `Sec-Fetch-Site: cross-site`; JSON content type required for writes; 64 MB body limit; error
  codes only.
- **Without the backend** (`vite build` served statically): the Segments tab explains that
  storage is unavailable; the ride heat map works as before.

## 8. Testing strategy

| Level       | Tool           | Location            | Scope                                                                                        |
| ----------- | -------------- | ------------------- | -------------------------------------------------------------------------------------------- |
| Unit        | Vitest         | `tests/unit`        | CSV/GPX/FIT parsers, classification, normalization, filters, heat map aggregation, summary   |
| Integration | Vitest + RTL   | `tests/integration` | Pipeline on a synthetic ZIP; UI + stores; segment UI against a fake API                      |
| Backend     | Vitest (node)  | `tests/server`      | SQLite repository (in memory and on disk), API handler on a real local HTTP server           |
| E2E         | Playwright     | `tests/e2e`         | Upload a synthetic ZIP → filters → statistics; segment journey against an in-memory database |
| Fixtures    | Synthetic only | `tests/fixtures`    | Small hand-made GPX/FIT/CSV; ZIPs built in tests with fflate                                 |

Every acceptance criterion gets at least one test named after its ID. NFR-05 requires coverage of
ZIP processing, classification, GPS parsing, filtering, heat map data preparation, segment
validation, segment persistence and the segment UI. Component tests can't reach the network:
`tests/setup.ts` replaces `fetch` with one that rejects unless a test stubs it.

## 9. Outstanding decisions

### Closed

| ID    | Topic                              | Resolution                                                                                                                      |
| ----- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| OD-01 | BRD missing                        | BRD v1.1 received and analysed                                                                                                  |
| OD-02 | Year/month selection model         | ADR-0005: opt-in, empty = unrestricted, Cartesian AND                                                                           |
| OD-03 | Heat map intensity                 | ADR-0006: grid-snapped segments, count of distinct activities                                                                   |
| OD-04 | Data loading                       | BRD v1.1 + ADR-0004: upload the original ZIP in the app; no persistence across reloads. BRD v2.0 confirms: rides are not stored |
| OD-25 | Segment data source                | BRD v2.0 + ADR-0010 (owner decision): one-time manual file import; no OAuth, no Strava API                                      |
| OD-05 | Time zone                          | ADR-0007: browser local time                                                                                                    |
| OD-06 | Metrics source                     | ADR-0007: `activities.csv` inside the ZIP, falling back to computing from the track                                             |
| OD-07 | Activity ID                        | ADR-0007: Strava `Activity ID`                                                                                                  |
| OD-09 | Summary statistics                 | ADR-0007: count, total distance, total elevation gain                                                                           |
| OD-10 | Units                              | ADR-0007: metric                                                                                                                |
| OD-11 | Performance target                 | ADR-0006: about 2,000 rides, under 250 ms per filter update; Web Worker import (ADR-0004)                                       |
| OD-12 | What counts as a ride              | BRD v1.1 + ADR-0007: `Activity Type` = `Ride` only                                                                              |
| OD-13 | Deployment                         | Local use only                                                                                                                  |
| OD-14 | Browsers                           | ADR-0007: latest desktop Chrome / Edge / Firefox; e2e on Chromium                                                               |
| OD-15 | Ride filter semantics              | ADR-0005: exclusion list, scoped to year/month, narrows only                                                                    |
| OD-16 | FIT files                          | BRD v1.1: supported (`@garmin/fitsdk`); TCX reported as unsupported                                                             |
| OD-17 | Incomplete activities              | ADR-0007: skip and report; "Untitled ride" for a missing name                                                                   |
| OD-19 | Mobile                             | ADR-0007: no native app; the responsive web layout stays                                                                        |
| OD-20 | Filter persistence                 | ADR-0005: in session only; reset on a new ZIP                                                                                   |
| OD-21 | App name                           | ADR-0007: "Strava Cycling Heat Map"                                                                                             |
| OD-08 | Map library                        | ADR-0008: plain `maplibre-gl` + `@deck.gl/mapbox`, no React wrapper                                                             |
| OD-22 | Base map provider                  | ADR-0008 (owner decision): MapLibre + OpenStreetMap tiles; no Google Maps, no key, no billing                                   |
| OD-26 | Segment matching and ride analysis | BRD v2.3 (owner decision): BR-38, defined by RULE-24 (see OD-28)                                                                |
| OD-28 | Segment matching definition        | BRD v2.3 RULE-24: within 25 m of start, then end, and of every route point between, same direction                              |
| OD-29 | Changed details of a stored ride   | BRD v2.3 RULE-22: newest upload's details win; stored track kept                                                                |
| OD-30 | Ride history performance           | BRD v2.3 NFR-10: restore ~2,000 rides < 5 s; location query < 500 ms                                                            |
| OD-31 | Ride database unavailable          | BRD v2.3 §10: uploads are refused, no in-memory fallback                                                                        |
| OD-32 | Location visits, period comparison | BRD v2.3 RULE-24 (distinct rides, default 100 m); ADR-0013 §7 metrics                                                           |

### Open

| ID    | Decision                                                                                                                                                                                                                                                                                      | Blocks    |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| OD-18 | Visualization modes (BRD §9) are deferred from the initial release. Revisit after the heat map ships.                                                                                                                                                                                         | —         |
| OD-23 | `activities.csv` headers are assumed to be in English. If the export is localized, header mapping will need extending. Confirm with a real export.                                                                                                                                            | Ingestion |
| OD-27 | The owner asked for selectable map styles and approved: Colourful / Light grey / Dark base maps, a choice of heat colours (Magenta–purple default, Fire), both remembered in the browser (§6b, implemented as "BR-32" in code and tests). Not yet in the BRD: the owner to confirm adding it. | —         |
| OD-24 | BR-17 and the segment import require size limits but the BRD gives no numbers. Provisional: ZIP ≤ 5 GB (`MAX_ARCHIVE_BYTES`), segment file ≤ 20 MB (`LIMITS.fileBytes`). Owner to confirm.                                                                                                    | —         |

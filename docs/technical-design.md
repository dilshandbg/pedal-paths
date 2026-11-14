# Technical Design

> Status: **Draft**, aligned with `docs/BRD.md` **v1.1** (2026-11-14). The decisions are recorded
> as ADRs in `docs/decisions/`. Requirement IDs are listed in `docs/traceability.md`.

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
- **Statistics** (BR-14, UX-08): ride count, total distance (km) and total elevation gain (m)
  of the filtered rides; unknown metrics are left out of the totals (ADR-0007).
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

All BRD v1.1 requirements are implemented and verified, including NFR-02 (ADR-0006 amendment).
Still worth doing: re-measure with a real Strava export.

## 2. Technology stack

| Concern         | Choice                                                         | Decision              |
| --------------- | -------------------------------------------------------------- | --------------------- |
| UI              | React 19 + TypeScript (strict)                                 | Project brief         |
| Build           | Vite 6                                                         | Project brief         |
| Styling         | Tailwind CSS 4                                                 | Project brief         |
| State           | Zustand 5                                                      | Project brief, BRD §8 |
| Base map        | MapLibre GL JS + OpenFreeMap (OSM) tiles                       | ADR-0008              |
| Route rendering | deck.gl 9 `LineLayer` + `ScatterplotLayer` via `MapboxOverlay` | ADR-0006, ADR-0008    |
| ZIP + gunzip    | `fflate`                                                       | ADR-0004              |
| FIT parsing     | `@garmin/fitsdk`                                               | ADR-0004              |
| GPX parsing     | Local text scanner (no library)                                | ADR-0004 amendment    |
| CSV parsing     | Local pure parser                                              | ADR-0004              |
| Background work | Web Worker (Vite `?worker` import)                             | ADR-0004              |
| Testing         | Vitest 4 + jsdom + RTL; Playwright                             | Project brief         |

## 3. Domain model (`src/types`)

| Type              | Purpose                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------- |
| `CyclingActivity` | One normalized Ride. `distanceKm` / `elevationGainM` are nullable ("when available", BR-13) |
| `GPSPoint`        | Track sample. `elevation` / `timestamp` are nullable                                        |
| `ActivityFilter`  | `selectedYears`, `selectedMonths` (opt-in, empty = all), `excludedActivityIds` (opt-out)    |
| `HeatMapData`     | `paths[]` with `coordinates`, `frequency`, `intensity`, `activityIds`; `maxFrequency`       |
| `ActivitySummary` | `activityCount`, `totalDistanceKm`, `totalElevationGainM`                                   |
| `ImportResult`    | Success (`activities`, `issues`, `excludedNonRideCount`) or failure (`reason`)              |
| `ImportIssue`     | A non-fatal, per-activity problem (UX-04)                                                   |
| `ImportStatus`    | Progress stages for the UI (UX-02)                                                          |

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

| Store                                 | Holds                                                                             |
| ------------------------------------- | --------------------------------------------------------------------------------- |
| `features/filters/store/filterStore`  | `ActivityFilter` (exists)                                                         |
| `features/activities/store` (planned) | Loaded `CyclingActivity[]`, precomputed segments, `ImportStatus`, `ImportIssue[]` |

## 8. Testing strategy

| Level       | Tool           | Location            | Scope                                                                                      |
| ----------- | -------------- | ------------------- | ------------------------------------------------------------------------------------------ |
| Unit        | Vitest         | `tests/unit`        | CSV/GPX/FIT parsers, classification, normalization, filters, heat map aggregation, summary |
| Integration | Vitest + RTL   | `tests/integration` | Pipeline on a synthetic ZIP; UI + stores                                                   |
| E2E         | Playwright     | `tests/e2e`         | Upload a synthetic ZIP → filters → count; invalid ZIP message                              |
| Fixtures    | Synthetic only | `tests/fixtures`    | Small hand-made GPX/FIT/CSV; ZIPs built in tests with fflate                               |

Every acceptance criterion gets at least one test named after its ID. NFR-05 requires coverage of
ZIP processing, classification, GPS parsing, filtering and heat map data preparation.

## 9. Outstanding decisions

### Closed

| ID    | Topic                      | Resolution                                                                                    |
| ----- | -------------------------- | --------------------------------------------------------------------------------------------- |
| OD-01 | BRD missing                | BRD v1.1 received and analysed                                                                |
| OD-02 | Year/month selection model | ADR-0005: opt-in, empty = unrestricted, Cartesian AND                                         |
| OD-03 | Heat map intensity         | ADR-0006: grid-snapped segments, count of distinct activities                                 |
| OD-04 | Data loading               | BRD v1.1 + ADR-0004: upload the original ZIP in the app; no persistence across reloads        |
| OD-05 | Time zone                  | ADR-0007: browser local time                                                                  |
| OD-06 | Metrics source             | ADR-0007: `activities.csv` inside the ZIP, falling back to computing from the track           |
| OD-07 | Activity ID                | ADR-0007: Strava `Activity ID`                                                                |
| OD-09 | Summary statistics         | ADR-0007: count, total distance, total elevation gain                                         |
| OD-10 | Units                      | ADR-0007: metric                                                                              |
| OD-11 | Performance target         | ADR-0006: about 2,000 rides, under 250 ms per filter update; Web Worker import (ADR-0004)     |
| OD-12 | What counts as a ride      | BRD v1.1 + ADR-0007: `Activity Type` = `Ride` only                                            |
| OD-13 | Deployment                 | Local use only                                                                                |
| OD-14 | Browsers                   | ADR-0007: latest desktop Chrome / Edge / Firefox; e2e on Chromium                             |
| OD-15 | Ride filter semantics      | ADR-0005: exclusion list, scoped to year/month, narrows only                                  |
| OD-16 | FIT files                  | BRD v1.1: supported (`@garmin/fitsdk`); TCX reported as unsupported                           |
| OD-17 | Incomplete activities      | ADR-0007: skip and report; "Untitled ride" for a missing name                                 |
| OD-19 | Mobile                     | ADR-0007: no native app; the responsive web layout stays                                      |
| OD-20 | Filter persistence         | ADR-0005: in session only; reset on a new ZIP                                                 |
| OD-21 | App name                   | ADR-0007: "Strava Cycling Heat Map"                                                           |
| OD-08 | Map library                | ADR-0008: plain `maplibre-gl` + `@deck.gl/mapbox`, no React wrapper                           |
| OD-22 | Base map provider          | ADR-0008 (owner decision): MapLibre + OpenStreetMap tiles; no Google Maps, no key, no billing |

### Open

| ID    | Decision                                                                                                                                           | Blocks    |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| OD-18 | Visualization modes (BRD §9) are deferred from the initial release. Revisit after the heat map ships.                                              | —         |
| OD-23 | `activities.csv` headers are assumed to be in English. If the export is localized, header mapping will need extending. Confirm with a real export. | Ingestion |

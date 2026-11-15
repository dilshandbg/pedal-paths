# Requirements Traceability Matrix

> Source: `docs/BRD.md` **v2.1**. Updated 2026-11-15. v2.0 kept every v1.1 ID and added BR-17 –
> BR-28, AC-17 – AC-29, RULE-12 – RULE-18, NFR-07 – NFR-09 and US-01 – US-06. v2.1 changes BR-23
> (JSON segment catalog, ADR-0011) and adds BR-29, BR-30, AC-30, AC-31 and RULE-19.
>
> `BR`, `AC`, `NFR`, `US` and RULE-12 – RULE-19 IDs come **from the BRD**. RULE-01 – RULE-11, `UX`
> and `DATA` IDs were **assigned here**, because the BRD lists those items without IDs. They are
> stable: never renumber them.
>
> Design decisions referenced below are recorded in `docs/decisions/` (ADR-xxxx).

**Status:** `Not started` · `In progress` · `Implemented` · `Verified` (tests pass) · `Blocked (OD-xx)`

The Tests columns name test files without their suffix: unit and integration tests live under
`tests/unit` and `tests/integration`, and e2e tests under `tests/e2e`.

## Business requirements (BRD §3)

| Req ID | Summary                                                                        | Design             | Status   | Implementation                                                                                                                     | Tests                                                                                                              |
| ------ | ------------------------------------------------------------------------------ | ------------------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| BR-01  | Accept the original Strava export ZIP as input                                 | ADR-0004           | Verified | `ArchiveUploadPanel`, `activitiesStore.loadArchive`, `importStravaArchive`                                                         | archive-upload, activitiesStore, e2e zip-upload                                                                    |
| BR-02  | Inspect and extract relevant files from the ZIP automatically                  | ADR-0004           | Verified | `services/strava-export/archive.ts`                                                                                                | archive, importStravaArchive, e2e zip-upload                                                                       |
| BR-03  | Identify activities classified as Ride                                         | ADR-0007           | Verified | `classifyActivities.ts`                                                                                                            | classifyActivities, importStravaArchive                                                                            |
| BR-04  | Exclude Run, Swim, Workout and every other non-Ride type                       | ADR-0007           | Verified | `classifyActivities.ts`                                                                                                            | classifyActivities, importStravaArchive, e2e zip-upload                                                            |
| BR-05  | Process GPS tracks from GPX and FIT files of Ride activities                   | ADR-0004           | Verified | `services/gpx/parseGpx.ts`, `services/fit/parseFit.ts`                                                                             | parseGpx, parseFit, importStravaArchive, e2e zip-upload                                                            |
| BR-06  | Interactive map with pan and zoom                                              | ADR-0008           | Verified | `MapView`, `HeatMapView`, `routeLayer`                                                                                             | MapView, bounds, e2e map                                                                                           |
| BR-07  | Year filter: select/deselect, multiple years                                   | ADR-0005           | Verified | `yearFilter` (`availableYears`, `setYearSelected`), `filterActivities`, `YearFilter`, `OptionChecklist`                            | filterActivities, OptionChecklist, filters (integration), e2e year-filter                                          |
| BR-08  | Month filter: select/deselect January–December                                 | ADR-0005           | Verified | `monthFilter` (`setMonthSelected`), `filterActivities`, `MonthFilter`, `OptionChecklist`, `monthName`                              | filterActivities, month, filters (integration), e2e month-filter                                                   |
| BR-09  | Individual ride filter: select/deselect rides                                  | ADR-0005           | Verified | `filterActivities`, `rideFilter` (`setRideIncluded`), `useFilteredActivities`, `RideFilter`, `RideList`, `HeatMapView`             | filterActivities, RideList, filters (integration), e2e ride-filter                                                 |
| BR-10  | Heat map updates automatically on filter change, no reload                     | ADR-0005           | Verified | `useFilteredActivities`, `HeatMapView`, `MapView` (layer replaced on the existing map)                                             | filters (integration), e2e dynamic-heatmap                                                                         |
| BR-11  | Year, month and ride filters combine to determine the contributing activities  | ADR-0005           | Verified | `filterActivities`, `activitiesInScope`, `describeActiveFilters`, `ActiveFiltersSummary`, `ActiveFilters`                          | filterActivities, describeActiveFilters, ActiveFilters, filters (integration), e2e combined-filters / month-filter |
| BR-12  | Intensity = how often roads/segments are traversed                             | ADR-0006           | Verified | `buildSegmentIndex`, `buildHeatMapGeometry`, `aggregateHeatMap`, `grid`, `heatStyle`, `routeLayer`, `HeatLegend`                   | buildSegmentIndex, buildHeatMapGeometry, aggregateHeatMap, grid, heatStyle, MapView, e2e heatmap                   |
| BR-13  | Show activity name, date, distance and elevation gain when available           | ADR-0007           | Verified | `normalizeActivity`, `describeRide`, `RideList`, `units`                                                                           | normalizeActivity, importStravaArchive, describeRide, units, RideList, filters (integration), e2e activity-details |
| BR-14  | Show the number of activities matching the active filters                      | ADR-0005, ADR-0007 | Verified | `summarizeActivities`, `describeSummary`, `ActivityStatistics`, `StatisticsPanel`                                                  | summarizeActivities, StatisticsPanel, filters (integration), e2e statistics                                        |
| BR-15  | Reset filters to show all Ride activities                                      | ADR-0005           | Verified | `ActiveFiltersSummary`, `ActiveFilters`, `isFilterActive`, `filterStore.resetFilter`                                               | ActiveFilters, isFilterActive, filterStore, filters (integration), e2e reset-filters                               |
| BR-16  | Load a different ZIP and refresh the dataset                                   | ADR-0004           | Verified | `activitiesStore.loadArchive`, `DashboardRoute`, `HeatMapView`                                                                     | activitiesStore, archive-upload, e2e zip-upload, e2e map                                                           |
| BR-17  | Validate ZIP type and size before processing                                   | OD-24              | Verified | `validateArchiveFile`, `activitiesStore.loadArchive`, `importMessages`                                                             | validateArchiveFile, activitiesStore, importMessages, archive-upload                                               |
| BR-18  | Each activity appears once; a new ZIP replaces the dataset                     | ADR-0004           | Verified | `importStravaArchive` (first row per activity ID), `activitiesStore.loadArchive`                                                   | importStravaArchive, archive-upload                                                                                |
| BR-19  | Ride count, distance, elevation gain, moving time, average distance            | ADR-0007           | Verified | `activitiesCsv` (Moving Time), `normalizeActivity`, `summarizeActivities`, `describeSummary`, `units`                              | activitiesCsv, normalizeActivity, summarizeActivities, units, filters (integration), e2e statistics                |
| BR-20  | Dedicated UI to upload segment details (JSON, CSV, GeoJSON)                    | ADR-0010           | Verified | `SegmentsSection`, `Tabs`, `parseSegmentFile`, `segmentFileWorker`, `segmentsStore.chooseFile`                                     | parseSegmentFile, segmentsStore, Tabs, segments (integration), e2e segments                                        |
| BR-21  | Validate the file and every record before storing; report each problem         | ADR-0010           | Verified | `checkSegmentFile`, `parseSegmentFile`, `validateSegmentPayload` (browser and backend), `SegmentImportProblems`                    | validateSegmentPayload, parseSegmentFile, describeSegment, catalogRepository, segmentsApi, segments (integration)  |
| BR-22  | Review new / update / unchanged before confirming; cancel stores nothing       | ADR-0010           | Verified | `planSegmentImport`, `POST /api/segments/preview`, `SegmentImportReview`, `segmentsStore.confirmImport`                            | planSegmentImport, catalogRepository, segmentsApi, segmentsStore, segments (integration), e2e segments             |
| BR-23  | Store metadata, geometry, efforts and personal bests in the local JSON catalog | ADR-0011           | Verified | `catalogFormat`, `catalogRepository`, `segmentsApi`, `vitePlugin`                                                                  | catalogFormat, catalogRepository (shared repository contract, file reload), segmentsApi, e2e segments              |
| BR-24  | Duplicates detected by segment ID; re-import updates; efforts not duplicated   | ADR-0010           | Verified | `mergeSegment`, `effortKey`, `planSegmentImport`, `catalogRepository.importPayload`                                                | segmentRules, planSegmentImport, catalogRepository, segments (integration), e2e segments                           |
| BR-25  | View, search, filter by distance, sort and inspect segments                    | ADR-0010           | Verified | `browseSegments`, `describeSegment`, `SegmentBrowser`, `SegmentDetails`, `GET /api/segments[/:id]`                                 | browseSegments, describeSegment, catalogRepository, segments (integration), e2e segments                           |
| BR-26  | Segment routes on the map, distinct and independent of heat map filters        | ADR-0010           | Verified | `buildSegmentOverlay`, `segmentBounds`, `useSegmentOverlay`, `segmentLayer`, `MapView`                                             | segmentOverlay, MapView, segments (integration), e2e segments                                                      |
| BR-27  | Remove one segment or all segment data                                         | ADR-0011           | Verified | `catalogRepository.remove` / `removeAll`, `DELETE /api/segments[/:id]`, `ConfirmAction`, `segmentsStore`                           | catalogRepository, segmentsApi, segmentsStore, Tabs (ConfirmAction), segments (integration), e2e segments          |
| BR-28  | No Strava authentication, API calls or automatic sync                          | ADR-0010           | Verified | No Strava client exists; `segmentsClient` calls same-origin `/api/segments` only                                                   | segmentsClient, segments (integration), e2e segments (no strava.com requests)                                      |
| BR-29  | Accept and store altitude and distance samples along the route                 | ADR-0011           | Verified | `parseSegmentFile` (streams, GeoJSON altitude), `validateSegmentPayload`, `mergeSegment`, `catalogFormat`, `describeSegmentDetail` | parseSegmentFile, validateSegmentPayload, segmentRules, catalogFormat, catalogRepository, describeSegment          |
| BR-30  | Migrate segments stored in SQLite into the catalog once, without loss          | ADR-0011           | Verified | `migrateLegacyDatabase`, `vitePlugin`                                                                                              | migrateLegacyDatabase                                                                                              |

## Acceptance criteria (BRD §5)

| Req ID | Verifies            | Summary                                                                      | Status   | Tests                                                                                             |
| ------ | ------------------- | ---------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------- |
| AC-01  | BR-01               | The user can select the original Strava ZIP through the app                  | Verified | archive-upload, e2e zip-upload                                                                    |
| AC-02  | BR-02               | The ZIP is inspected and processed without manual extraction                 | Verified | archive, importStravaArchive, e2e zip-upload                                                      |
| AC-03  | BR-03               | Activities classified as Ride are identified and loaded                      | Verified | classifyActivities, importStravaArchive                                                           |
| AC-04  | BR-04               | Run, Swim, Workout and other non-Ride activities are excluded                | Verified | classifyActivities, importStravaArchive, e2e zip-upload                                           |
| AC-05  | BR-05               | GPX and FIT tracks are processed and visualized                              | Verified | parseGpx, parseFit, importStravaArchive, e2e zip-upload, e2e map                                  |
| AC-06  | BR-06, BR-11        | The initial heat map shows all eligible Rides with valid GPS                 | Verified | filterActivities (unrestricted filter), filters (integration), e2e year-filter / month-filter     |
| AC-07  | BR-07               | Deselecting a year removes that year's rides                                 | Verified | filterActivities, filters (integration), e2e year-filter                                          |
| AC-08  | BR-08, BR-11        | Deselecting a month removes that month's rides, subject to other filters     | Verified | filterActivities, filters (integration), e2e month-filter                                         |
| AC-09  | BR-09               | Deselecting a ride removes its heat map contribution                         | Verified | filterActivities, aggregateHeatMap, filters (integration), e2e ride-filter                        |
| AC-10  | BR-07, BR-08        | The same month can be filtered across multiple selected years                | Verified | filterActivities, filters (integration), e2e month-filter                                         |
| AC-11  | BR-10               | Heat map updates without a full page reload                                  | Verified | filters (integration), e2e dynamic-heatmap                                                        |
| AC-12  | BR-12               | Frequently traversed roads show greater intensity                            | Verified | aggregateHeatMap, heatStyle, MapView, e2e heatmap                                                 |
| AC-13  | BR-14               | Activity count reflects the currently filtered Rides                         | Verified | summarizeActivities, filters (integration), e2e statistics                                        |
| AC-14  | BR-15               | Reset restores all eligible Rides                                            | Verified | filters (integration), e2e reset-filters                                                          |
| AC-15  | BR-16               | Loading a new ZIP replaces the dataset and refreshes the visualization       | Verified | activitiesStore, archive-upload, MapView, e2e zip-upload, e2e map                                 |
| AC-16  | BR-01, BR-05, UX-04 | An invalid ZIP, or one without eligible Ride GPS data, shows a clear message | Verified | archive, importStravaArchive, importMessages, archive-upload, e2e zip-upload                      |
| AC-17  | BR-17               | Non-ZIP or oversized file rejected before processing, with the reason        | Verified | validateArchiveFile, activitiesStore, importMessages, archive-upload                              |
| AC-18  | BR-18               | A duplicated activity appears once; loading a ZIP twice doubles nothing      | Verified | importStravaArchive, archive-upload                                                               |
| AC-19  | BR-19               | Statistics show the five values for the filtered rides and update            | Verified | summarizeActivities, describeSummary, filters (integration), e2e statistics                       |
| AC-20  | BR-20               | A JSON, CSV or GeoJSON file is chosen from a dedicated Segments section      | Verified | parseSegmentFile, segments (integration), e2e segments                                            |
| AC-21  | BR-21               | An invalid file is rejected naming the problem and record; nothing stored    | Verified | parseSegmentFile, validateSegmentPayload, catalogRepository, segments (integration), e2e segments |
| AC-22  | BR-22               | The review shows ID, name, figures and status; cancel stores nothing         | Verified | planSegmentImport, describeSegment, segmentsStore, segments (integration), e2e segments           |
| AC-23  | BR-23               | Segments, routes and efforts survive a reload and a restart                  | Verified | catalogRepository (reopened catalog file), e2e segments (reload)                                  |
| AC-24  | BR-24               | An existing ID is updated, never listed twice; efforts not duplicated        | Verified | segmentRules, planSegmentImport, catalogRepository, segments (integration), e2e segments          |
| AC-25  | BR-25               | Search by name, filter by distance range, sort by distance, elevation or PB  | Verified | browseSegments, segments (integration), e2e segments                                              |
| AC-26  | BR-25               | Detail view: metadata, effort history and personal best; back to the list    | Verified | describeSegment, catalogRepository, segments (integration), e2e segments                          |
| AC-27  | BR-26               | Distinct route style, unaffected by heat map filters; a click opens details  | Verified | segmentOverlay, MapView, segments (integration), e2e segments                                     |
| AC-28  | BR-27               | Remove one or all after confirming; gone after a reload                      | Verified | catalogRepository, segmentsApi, segmentsStore, segments (integration), e2e segments (reload)      |
| AC-29  | BR-28               | No network requests to Strava                                                | Verified | segmentsClient, segments (integration), e2e segments                                              |
| AC-30  | BR-29               | Samples imported, mismatches rejected, samples kept after a restart          | Verified | parseSegmentFile, validateSegmentPayload, catalogRepository                                       |
| AC-31  | BR-30               | Every SQLite segment appears unchanged in the catalog; migration runs once   | Verified | migrateLegacyDatabase                                                                             |

**Coverage gaps:** BR-06 (pan/zoom) and BR-13 (activity details) have no acceptance criterion.
Their tests are derived from the requirement text.

## Business rules (BRD §4; RULE-01 – RULE-11 assigned here)

| Req ID  | Rule                                                                      | Traced via      |
| ------- | ------------------------------------------------------------------------- | --------------- |
| RULE-01 | The original Strava export ZIP is the primary data source                 | BR-01           |
| RULE-02 | No separately prepared input file may be required                         | BR-01, BR-02    |
| RULE-03 | Ride is identified from the classification metadata in the archive        | BR-03, ADR-0007 |
| RULE-04 | Only Ride activities contribute to the heat map **and statistics**        | BR-03, BR-04    |
| RULE-05 | Non-Ride activities are excluded                                          | BR-04           |
| RULE-06 | GPS data is extracted from GPX and FIT files                              | BR-05           |
| RULE-07 | Activities without usable GPS don't contribute but are handled gracefully | DATA-05, UX-04  |
| RULE-08 | Year, month and ride filters combine                                      | BR-11           |
| RULE-09 | An unrestricted year/month dimension includes all values                  | ADR-0005        |
| RULE-10 | Intensity reflects repeated route traversal                               | BR-12           |
| RULE-11 | Filter changes update the visualization without a full page reload        | BR-10           |
| RULE-12 | A Strava activity ID appears at most once in the ride dataset             | BR-18           |
| RULE-13 | Statistics use only known values; a ride without one still counts         | BR-19           |
| RULE-14 | At most one stored segment per Strava segment ID                          | BR-24           |
| RULE-15 | A segment import is all-or-nothing                                        | BR-21           |
| RULE-16 | Re-import replaces the given details and keeps efforts; effort identity   | BR-24           |
| RULE-17 | Personal best = fastest effort, otherwise the one stated in the file      | BR-25           |
| RULE-18 | Segment data never changes the ride heat map or statistics                | BR-26           |
| RULE-19 | Samples have one value per route point; a different route replaces them   | BR-29           |

## User experience (BRD §6; IDs assigned)

| Req ID | Summary                                                                       | Related         | Status   |
| ------ | ----------------------------------------------------------------------------- | --------------- | -------- |
| UX-01  | ZIP file upload control                                                       | BR-01, AC-01    | Verified |
| UX-02  | Processing status while the archive is inspected and parsed                   | BR-02           | Verified |
| UX-03  | Show the number of Ride activities loaded successfully                        | BR-03           | Verified |
| UX-04  | Clearly indicate activities that could not be processed                       | RULE-07, AC-16  | Verified |
| UX-05  | Year, month and ride filter controls                                          | BR-07–09        | Verified |
| UX-06  | Show the currently active filters                                             | BR-11           | Verified |
| UX-07  | Reset-to-all option                                                           | BR-15           | Verified |
| UX-08  | Show the activity count and relevant summary statistics                       | BR-14, ADR-0007 | Verified |
| UX-09  | The map stays responsive while filters change                                 | NFR-02          | Verified |
| UX-10  | Reject unsupported or oversized files before processing                       | BR-17, BR-21    | Verified |
| UX-11  | Segments section: upload, validation, review, list, detail, confirmed removal | BR-20 – BR-27   | Verified |
| UX-12  | Segment routes on the same map, distinct style, selection highlighted         | BR-26           | Verified |

## User stories (BRD §6)

| Req ID | Story (short)                                                              | Covered by                  | Status   |
| ------ | -------------------------------------------------------------------------- | --------------------------- | -------- |
| US-01  | Upload the export ZIP and see where I ride most                            | BR-01 – BR-05, BR-12        | Verified |
| US-02  | Narrow to years, months or rides, with matching statistics                 | BR-07 – BR-11, BR-14, BR-19 | Verified |
| US-03  | Upload a segment file, check what will be imported and confirm             | BR-20 – BR-23               | Verified |
| US-04  | Upload a newer file to update segments and add efforts without duplicates  | BR-24                       | Verified |
| US-05  | Find a segment, see efforts and PB, see it on the map next to the heat map | BR-25, BR-26                | Verified |
| US-06  | Remove segment data I no longer want stored                                | BR-27, NFR-09               | Verified |

## Data (BRD §7; IDs assigned)

| Req ID  | Summary                                                                                     | Design        | Status   |
| ------- | ------------------------------------------------------------------------------------------- | ------------- | -------- |
| DATA-01 | Input: the original Strava export ZIP                                                       | ADR-0004      | Verified |
| DATA-02 | Supported GPS formats: GPX and FIT (including Strava's `.gz`-compressed variants)           | ADR-0004      | Verified |
| DATA-03 | Where available: name, type, date/time, distance, elevation gain, GPS points                | ADR-0007      | Verified |
| DATA-04 | Inspect archive → identify Rides → associate them with GPS files → parse → normalize        | ADR-0004      | Verified |
| DATA-05 | Missing or malformed files must not terminate the whole import                              | ADR-0004      | Verified |
| DATA-06 | Validate type and size first; keep each activity ID once; read moving time                  | BR-17 – BR-19 | Verified |
| DATA-07 | Segment fields and file types per BRD §7 and `docs/segment-import-format.md`                | ADR-0010      | Verified |
| DATA-08 | Rides in memory only; segments in the local JSON catalog, never sent to an external service | ADR-0011      | Verified |

## Non-functional, security and privacy (BRD §10)

| Req ID | Summary                                                                | Status                                                                                                                                                                           |
| ------ | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NFR-01 | Runs locally as a personal application                                 | Verified: Vite dev or preview server on the local machine; no hosted service                                                                                                     |
| NFR-02 | Map responsive on filter change (~2,000 rides, under 250 ms)           | Verified: 34–169 ms from filter change to frame for 2,000 rides (ADR-0006 amendment); `npm run perf`                                                                             |
| NFR-03 | No hardcoded or committed secrets; configuration via `.env.example`    | Verified: no secrets needed (ADR-0008); `VITE_MAP_STYLE_URL`, `SEGMENT_CATALOG_PATH` and `SEGMENTS_DB_PATH` documented; `.env*` and `data/` git-ignored                          |
| NFR-04 | No Google Maps billing or paid mapping services                        | Verified: MapLibre and OpenFreeMap (ADR-0008)                                                                                                                                    |
| NFR-05 | Tests cover ZIP, classification, GPS, filtering, heat map and segments | Verified: unit, integration, backend (`tests/server`) and e2e tests for each area                                                                                                |
| NFR-06 | Setup instructions                                                     | Verified: README "Getting started" and "Segments"                                                                                                                                |
| NFR-07 | Data stays on the machine; backend local only                          | Verified: rides never leave the browser; the segment API answers loopback peers only (`isLoopbackAddress`) and Vite binds to localhost. Tests: segmentsApi                       |
| NFR-08 | Backend validates every request, limits size, hides internals          | Verified: `validateSegmentPayload` on the server, 64 MB body limit, JSON content type, Origin and Sec-Fetch-Site checks, error codes only. Tests: segmentsApi, catalogRepository |
| NFR-09 | Remove all segment data; docs explain the catalog file                 | Verified: "Remove all segment data" (BR-27); README "Removing stored data", `docs/segment-catalog-format.md`                                                                     |

## Out of scope (BRD §2), to guard against scope creep

Strava OAuth and any Strava API access (BR-28) · automatic or background sync · automatic segment discovery from rides · social sharing · mobile application support (native app; the
responsive web layout stays, see ADR-0007) · live GPS tracking · heart-rate / power analysis ·
heat map vs. individual-route modes (BRD §9: deferred, see OD-18).

## Conventions

- Code that implements a requirement cites it in a comment: `// Implements: BR-05`.
- Tests that verify a requirement name it: `describe('AC-10: month across multiple years', …)`.
- A pull request or commit that delivers a requirement updates this table.

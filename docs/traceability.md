# Requirements Traceability Matrix

> Source: `docs/BRD.md` **v1.1** (Draft). Analysed 2026-11-14. This replaces the v1.0 analysis: the
> BRD renumbered every BR and AC.
>
> `BR-xx` and `AC-xx` IDs come **from the BRD**. The BRD gives no IDs for business rules (§4),
> user experience (§6), data (§7) or definition of done (§10), so the `RULE`, `UX`, `DATA` and `NFR`
> IDs were **assigned here**. They are stable: never renumber them.
>
> Design decisions referenced below are recorded in `docs/decisions/` (ADR-xxxx).

**Status:** `Not started` · `In progress` · `Implemented` · `Verified` (tests pass) · `Blocked (OD-xx)`

The Tests columns name test files without their suffix: unit and integration tests live under
`tests/unit` and `tests/integration`, and e2e tests under `tests/e2e`.

## Business requirements (BRD §3)

| Req ID | Summary                                                                       | Design   | Status                                                         | Implementation                                                                                                         | Tests                                                                      |
| ------ | ----------------------------------------------------------------------------- | -------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| BR-01  | Accept the original Strava export ZIP as input                                | ADR-0004 | Verified                                                       | `ArchiveUploadPanel`, `activitiesStore.loadArchive`, `importStravaArchive`                                             | archive-upload, activitiesStore, e2e zip-upload                            |
| BR-02  | Inspect and extract relevant files from the ZIP automatically                 | ADR-0004 | Verified                                                       | `services/strava-export/archive.ts`                                                                                    | archive, importStravaArchive, e2e zip-upload                               |
| BR-03  | Identify activities classified as Ride                                        | ADR-0007 | Verified                                                       | `classifyActivities.ts`                                                                                                | classifyActivities, importStravaArchive                                    |
| BR-04  | Exclude Run, Swim, Workout and every other non-Ride type                      | ADR-0007 | Verified                                                       | `classifyActivities.ts`                                                                                                | classifyActivities, importStravaArchive, e2e zip-upload                    |
| BR-05  | Process GPS tracks from GPX and FIT files of Ride activities                  | ADR-0004 | Verified                                                       | `services/gpx/parseGpx.ts`, `services/fit/parseFit.ts`                                                                 | parseGpx, parseFit, importStravaArchive, e2e zip-upload                    |
| BR-06  | Interactive map with pan and zoom                                             | ADR-0008 | Verified                                                       | `MapView`, `HeatMapView`, `routeLayer`                                                                                 | MapView, bounds, e2e map                                                   |
| BR-07  | Year filter: select/deselect, multiple years                                  | ADR-0005 | Verified                                                       | `yearFilter` (`availableYears`, `setYearSelected`), `filterActivities`, `YearFilter`, `OptionChecklist`                | filterActivities, OptionChecklist, filters (integration), e2e year-filter  |
| BR-08  | Month filter: select/deselect January–December                                | ADR-0005 | Not started                                                    | —                                                                                                                      | —                                                                          |
| BR-09  | Individual ride filter: select/deselect rides                                 | ADR-0005 | Verified                                                       | `filterActivities`, `rideFilter` (`setRideIncluded`), `useFilteredActivities`, `RideFilter`, `RideList`, `HeatMapView` | filterActivities, RideList, filters (integration), e2e ride-filter         |
| BR-10  | Heat map updates automatically on filter change, no reload                    | ADR-0005 | Not started                                                    | —                                                                                                                      | —                                                                          |
| BR-11  | Year, month and ride filters combine to determine the contributing activities | ADR-0005 | Not started                                                    | —                                                                                                                      | —                                                                          |
| BR-12  | Intensity = how often roads/segments are traversed                            | ADR-0006 | Verified                                                       | `buildSegmentIndex`, `aggregateHeatMap`, `grid`, `heatStyle`, `routeLayer`, `HeatLegend`                               | buildSegmentIndex, aggregateHeatMap, grid, heatStyle, MapView, e2e heatmap |
| BR-13  | Show activity name, date, distance and elevation gain when available          | ADR-0007 | In progress: data normalized; display comes with the ride list | `normalizeActivity.ts`                                                                                                 | normalizeActivity, importStravaArchive                                     |
| BR-14  | Show the number of activities matching the active filters                     | ADR-0005 | Not started                                                    | —                                                                                                                      | —                                                                          |
| BR-15  | Reset filters to show all Ride activities                                     | ADR-0005 | Not started                                                    | —                                                                                                                      | —                                                                          |
| BR-16  | Load a different ZIP and refresh the dataset                                  | ADR-0004 | Verified                                                       | `activitiesStore.loadArchive`, `DashboardRoute`, `HeatMapView`                                                         | activitiesStore, archive-upload, e2e zip-upload, e2e map                   |

## Acceptance criteria (BRD §5)

| Req ID | Verifies            | Summary                                                                      | Status      | Tests                                                                        |
| ------ | ------------------- | ---------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------- |
| AC-01  | BR-01               | The user can select the original Strava ZIP through the app                  | Verified    | archive-upload, e2e zip-upload                                               |
| AC-02  | BR-02               | The ZIP is inspected and processed without manual extraction                 | Verified    | archive, importStravaArchive, e2e zip-upload                                 |
| AC-03  | BR-03               | Activities classified as Ride are identified and loaded                      | Verified    | classifyActivities, importStravaArchive                                      |
| AC-04  | BR-04               | Run, Swim, Workout and other non-Ride activities are excluded                | Verified    | classifyActivities, importStravaArchive, e2e zip-upload                      |
| AC-05  | BR-05               | GPX and FIT tracks are processed and visualized                              | Verified    | parseGpx, parseFit, importStravaArchive, e2e zip-upload, e2e map             |
| AC-06  | BR-06, BR-11        | The initial heat map shows all eligible Rides with valid GPS                 | Not started | —                                                                            |
| AC-07  | BR-07               | Deselecting a year removes that year's rides                                 | Verified    | filterActivities, filters (integration), e2e year-filter                     |
| AC-08  | BR-08, BR-11        | Deselecting a month removes that month's rides, subject to other filters     | Not started | —                                                                            |
| AC-09  | BR-09               | Deselecting a ride removes its heat map contribution                         | Verified    | filterActivities, aggregateHeatMap, filters (integration), e2e ride-filter   |
| AC-10  | BR-07, BR-08        | The same month can be filtered across multiple selected years                | Not started | —                                                                            |
| AC-11  | BR-10               | Heat map updates without a full page reload                                  | Not started | —                                                                            |
| AC-12  | BR-12               | Frequently traversed roads show greater intensity                            | Verified    | aggregateHeatMap, heatStyle, MapView, e2e heatmap                            |
| AC-13  | BR-14               | Activity count reflects the currently filtered Rides                         | Not started | —                                                                            |
| AC-14  | BR-15               | Reset restores all eligible Rides                                            | Not started | —                                                                            |
| AC-15  | BR-16               | Loading a new ZIP replaces the dataset and refreshes the visualization       | Verified    | activitiesStore, archive-upload, MapView, e2e zip-upload, e2e map            |
| AC-16  | BR-01, BR-05, UX-04 | An invalid ZIP, or one without eligible Ride GPS data, shows a clear message | Verified    | archive, importStravaArchive, importMessages, archive-upload, e2e zip-upload |

**Coverage gaps:** BR-06 (pan/zoom) and BR-13 (activity details) have no acceptance criterion.
Their tests will be derived from the requirement text.

## Business rules (BRD §4; IDs assigned)

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

## User experience (BRD §6; IDs assigned)

| Req ID | Summary                                                     | Related         | Status                                                         |
| ------ | ----------------------------------------------------------- | --------------- | -------------------------------------------------------------- |
| UX-01  | ZIP file upload control                                     | BR-01, AC-01    | Verified                                                       |
| UX-02  | Processing status while the archive is inspected and parsed | BR-02           | Verified                                                       |
| UX-03  | Show the number of Ride activities loaded successfully      | BR-03           | Verified                                                       |
| UX-04  | Clearly indicate activities that could not be processed     | RULE-07, AC-16  | Verified                                                       |
| UX-05  | Year, month and ride filter controls                        | BR-07–09        | In progress: year and ride filters done; month pending (BR-08) |
| UX-06  | Show the currently active filters                           | BR-11           | Not started                                                    |
| UX-07  | Reset-to-all option                                         | BR-15           | Not started                                                    |
| UX-08  | Show the activity count and relevant summary statistics     | BR-14, ADR-0007 | Not started                                                    |
| UX-09  | The map stays responsive while filters change               | NFR-02          | Not started                                                    |

## Data (BRD §7; IDs assigned)

| Req ID  | Summary                                                                              | Design   | Status   |
| ------- | ------------------------------------------------------------------------------------ | -------- | -------- |
| DATA-01 | Input: the original Strava export ZIP                                                | ADR-0004 | Verified |
| DATA-02 | Supported GPS formats: GPX and FIT (including Strava's `.gz`-compressed variants)    | ADR-0004 | Verified |
| DATA-03 | Where available: name, type, date/time, distance, elevation gain, GPS points         | ADR-0007 | Verified |
| DATA-04 | Inspect archive → identify Rides → associate them with GPS files → parse → normalize | ADR-0004 | Verified |
| DATA-05 | Missing or malformed files must not terminate the whole import                       | ADR-0004 | Verified |

## Non-functional and definition of done (BRD §2, §8, §10; IDs assigned)

| Req ID | Summary                                                                                                        | Status                                                                                                                                                                                                                                    |
| ------ | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NFR-01 | Runs locally as a personal application (§2)                                                                    | Scaffold: client-side only (ADR-0002)                                                                                                                                                                                                     |
| NFR-02 | The map stays responsive while filters change (§6)                                                             | In progress: import and segment index run in a Web Worker (ADR-0004, ADR-0006); re-aggregation measured 280–970 ms on a 2,000-ride worst case, above the 250 ms target (ADR-0006 amendment); re-measure with real data once filters exist |
| NFR-03 | No API secrets committed (§10)                                                                                 | Scaffold: no secrets needed (ADR-0008); `.env*` git-ignored                                                                                                                                                                               |
| NFR-04 | Runs locally **without requiring Google Maps billing** (§8, non-binding)                                       | Resolved by ADR-0008: MapLibre + OSM, no key                                                                                                                                                                                              |
| NFR-05 | Automated tests cover ZIP processing, classification, GPS parsing, filtering and visualization data prep (§10) | In progress: ZIP processing, classification, GPS parsing and heat map preparation covered; filtering pending                                                                                                                              |
| NFR-06 | Setup instructions explain how to run the app locally (§10)                                                    | Scaffold: README                                                                                                                                                                                                                          |

## Out of scope (BRD §2), to guard against scope creep

Strava OAuth · automatic sync · social sharing · mobile application support (native app; the
responsive web layout stays, see ADR-0007) · live GPS tracking · heart-rate / power analysis ·
heat map vs. individual-route modes (BRD §9: deferred, see OD-18).

## Conventions

- Code that implements a requirement cites it in a comment: `// Implements: BR-05`.
- Tests that verify a requirement name it: `describe('AC-10: month across multiple years', …)`.
- A pull request or commit that delivers a requirement updates this table.

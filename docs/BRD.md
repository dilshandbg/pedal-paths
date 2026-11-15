# Business Requirements Document (BRD)
## Strava Cycling Ride Analyzer — Personal Heatmap and Segments

**Version:** 2.2  
**Status:** Draft — approved for implementation by the owner (2026-11-15)

### Change History

| Version | Date | Summary |
|---|---|---|
| 1.0 | 2026-11-14 | Initial BRD: heatmap from a Strava activities CSV. |
| 1.1 | 2026-11-14 | Input changed to the original Strava export ZIP archive. |
| 2.0 | 2026-11-15 | Adds ZIP file validation (BR-17), duplicate-ride protection (BR-18), extended ride statistics (BR-19) and a manually imported **Segments** capability stored in local SQLite (BR-20 – BR-28). Strava OAuth and Strava API access are explicitly out of scope: segment data is uploaded by the user. Adds user stories, non-functional, security and privacy requirements, and updates the technical direction to the implemented stack. |
| 2.1 | 2026-11-15 | Segment data is stored in a local **JSON segment catalog** file instead of SQLite (BR-23, ADR-0011). Segments can include altitude and distance samples along the route (BR-29, RULE-19). Segments stored in SQLite by version 2.0 are migrated into the catalog once, without loss (BR-30). Ride data is still not persisted. Segment matching and ride analysis against the catalog are recorded as an open decision (OD-26) until specified. |
| 2.2 | 2026-11-15 | Adds an optional, separate command that downloads the user's segment details, names and route streams from Strava with the user's own access token into an upload file (BR-31); the application itself still never contacts Strava (BR-28 revised). Segments without route geometry are shown by their start and end only, never as a straight line (BR-26 revised). Missing segment statistics are derived from altitude and distance samples, never estimated otherwise (RULE-20). |

## 1. Business Objective

Build a personal web application that visualizes cycling activities from a Strava export ZIP archive on an interactive map. Users should be able to filter activities by year, month, and individual ride, with the heatmap updating dynamically.

The application must automatically extract the ZIP archive, identify activities classified as Ride, and process their GPS tracks. Users should not need to manually extract files or prepare a separate data file.

In addition, users can manually import details of Strava segments they care about (metadata, route geometry and their own efforts and personal bests), keep them in a local database, browse them, and see their routes on the same map. The application never connects to Strava.

## 2. Scope

### In Scope
- Accept the original Strava export ZIP archive as the primary input.
- Validate the archive's file type and size before processing it.
- Automatically extract and inspect the ZIP archive.
- Identify activities classified as Ride.
- Process the GPS tracks of cycling activities from supported GPX and FIT files.
- Exclude non-cycling activities such as Run, Swim, and Workout.
- Display cycling routes on an interactive map.
- Provide heatmap visualization of overlapping ride tracks.
- Filter activities by year, month, and individual ride.
- Dynamically update the map when filters change.
- Display basic activity details and summary statistics.
- Allow users to load or replace their Strava export ZIP file.
- Manually import Strava segment details from JSON, CSV or GeoJSON files.
- Store imported segment data locally in a JSON segment catalog file; browse, search, filter, inspect and remove it.
- Display segment routes on the map.
- Run locally as a personal application.

### Out of Scope
- Strava OAuth authentication and any Strava API access by the application, including segment discovery or retrieval. (The separate, optional download command of BR-31 is the only exception.)
- Automatic synchronization or refresh of activities or segments from Strava; background sync.
- Automatic discovery of segments from the imported rides.
- Persisting imported ride activities between sessions (rides are held in memory until the page is reloaded or a new ZIP is loaded).
- Social sharing.
- Mobile application support (native app).
- Live GPS tracking.
- Heart-rate or power analysis.

### Data Sources by Capability

| Capability | Data source | Strava API needed |
|---|---|---|
| Heatmap, filters, ride details, statistics | Strava export ZIP (activities.csv + GPX/FIT files) | No |
| Segments | Files the user prepares and uploads (JSON, CSV, GeoJSON) | No |
| Segment names and routes for the upload file (optional) | The user's own Strava access token, used by the download command (BR-31) | Yes, outside the application |

## 3. Business Requirements

| ID | Requirement | Description |
|---|---|---|
| BR-01 | ZIP File Input | The application must accept the original Strava export ZIP archive as its input. |
| BR-02 | Automatic ZIP Extraction | The application must automatically inspect and extract relevant files from the ZIP archive without requiring manual extraction. |
| BR-03 | Ride Activity Identification | The application must identify activities classified as Ride from the Strava export archive. |
| BR-04 | Non-Ride Exclusion | Activities classified as Run, Swim, Workout, or other non-Ride activity types must be excluded from the cycling visualization. |
| BR-05 | GPS Track Processing | The application must process GPS track data from supported GPX and FIT files associated with Ride activities. |
| BR-06 | Interactive Map | Display cycling GPS tracks on an interactive map with pan and zoom. |
| BR-07 | Year Filter | Allow users to select and deselect years, including multiple years. |
| BR-08 | Month Filter | Allow users to select and deselect months from January to December. |
| BR-09 | Individual Ride Filter | Allow users to select and deselect individual rides. |
| BR-10 | Dynamic Heatmap | Update the heatmap automatically when filters change, without reloading the application. |
| BR-11 | Combined Filtering | Combine year, month, and ride filters to determine which activities contribute to the heatmap. |
| BR-12 | Route Frequency Intensity | Heatmap intensity must represent how frequently roads or route segments are traversed. |
| BR-13 | Activity Details | Display activity name, date, distance, and elevation gain when available. |
| BR-14 | Activity Count | Display the number of activities matching the active filters. |
| BR-15 | Reset Filters | Provide an option to reset filters and display all Ride activities. |
| BR-16 | ZIP Replacement | Allow the user to load a different Strava export ZIP archive and refresh the application dataset. |
| BR-17 | ZIP File Validation | Before processing, validate that the selected file is a ZIP archive and does not exceed the maximum supported size. |
| BR-18 | Duplicate Ride Protection | Each Strava activity appears at most once in the loaded dataset, even if the export lists it more than once. Loading the same or another ZIP replaces the dataset instead of adding to it. |
| BR-19 | Ride Statistics | For the filtered rides, display the number of rides, total distance, total elevation gain, total moving time, and average distance per ride, where the data is available. |
| BR-20 | Segment File Import | Provide a dedicated UI to upload segment details from a JSON, CSV or GeoJSON file that the user prepared outside the application. |
| BR-21 | Segment Validation | Validate the uploaded file and every record against the segment import schema before anything is stored, and report each problem clearly. |
| BR-22 | Segment Import Review | Show the validated segments, and whether each is new, an update or unchanged, for review. Store nothing until the user confirms; allow cancelling. |
| BR-23 | Segment Persistence | Store imported segment metadata, route geometry, and personal efforts and personal bests (when provided) in a local JSON segment catalog file, so they are available in later sessions and when the application starts. |
| BR-24 | Segment Duplicate Detection and Update | Identify segments by their Strava segment ID. Importing a segment that already exists updates its details instead of creating a duplicate. Efforts are not duplicated either. |
| BR-25 | Segment Browsing | Let the user view the imported segments, search them by name, filter them by distance, sort them by distance, elevation gain and personal best, and open a segment's details including its effort history with the personal best identified. |
| BR-26 | Segment Map Overlay | Display segment routes on the existing map, visually distinct from the ride heatmap and independent of the heatmap filters, using the complete route geometry. A segment without route geometry is shown by markers at its start and end, never by a straight line between them, and its details say that the route is not available. The user can select a segment on the map to inspect it. |
| BR-27 | Segment Data Removal | Let the user remove a single imported segment or all imported segment data. |
| BR-28 | No Strava Connection in the Application | The application must work without Strava API access: it must not authenticate with Strava, call the Strava API, or synchronize data automatically. |
| BR-29 | Segment Samples | Accept and store, when the file provides them, altitude samples and distance samples along a segment's route, one per route point, as part of the segment's complete data. |
| BR-30 | Segment Catalog Migration | Segments stored by an earlier version in the local SQLite database are moved into the JSON segment catalog once, keeping every stored detail, route geometry, elevation value, effort and import date. |
| BR-31 | Segment Download Command | Provide an optional command, separate from the application, that downloads the details (including the name) and the latlng, altitude and distance streams of given Strava segments with an access token the user supplies through the environment, and writes them as a segment upload file. The user then uploads and reviews that file as usual. The token is never stored by the application, logged or committed. |

## 4. Business Rules

- The original Strava export ZIP archive is the primary data source for rides.
- The application must not require a separately prepared input file for rides.
- The application must identify Ride activities based on the activity classification information available in the export archive.
- Only Ride activities contribute to the heatmap and cycling statistics.
- Non-Ride activities must be excluded.
- GPS data must be extracted from supported GPX and FIT files.
- Activities without usable GPS track data should not contribute to the heatmap, but should be handled gracefully.
- Year, month, and individual ride filters must combine to determine the matching activities.
- If a year or month filter is unrestricted, all values for that dimension are included.
- Heatmap intensity must reflect repeated route traversal.
- Filter changes must update the visualization without a full page reload.
- A Strava activity ID appears at most once in the loaded ride dataset (RULE-12).
- Statistics include only rides for which the value is known; a ride without a known value still counts as a ride (RULE-13).
- A segment is identified by its Strava segment ID; there is at most one stored record per ID (RULE-14).
- A segment import is all-or-nothing: if any record is invalid, nothing from that file is stored (RULE-15).
- Re-importing a segment replaces the details provided in the new file and keeps existing efforts; an effort is identified by its effort ID, or by its start time and elapsed time when it has no ID (RULE-16).
- A segment's personal best is its fastest recorded effort; if no efforts are provided, the personal best stated in the file is used (RULE-17).
- Segment data never changes the ride heatmap or ride statistics (RULE-18).
- A statistic stated in the uploaded file is shown as given. A missing distance, elevation gain, average or maximum grade, or elevation range is computed from the route's altitude and distance samples when they exist, and marked as computed; otherwise it is shown as not available. No statistic is estimated in any other way (RULE-20).
- Altitude and distance samples belong to the route they were provided with: they must have one value per route point (distances never decreasing). A later import with a different route replaces them, with none if it provides none (RULE-19).

## 5. Acceptance Criteria

| ID | Acceptance Criteria |
|---|---|
| AC-01 | The user can select the original Strava export ZIP archive through the application. |
| AC-02 | The application automatically inspects and processes the ZIP archive without manual extraction. |
| AC-03 | The application identifies and loads activities classified as Ride. |
| AC-04 | Run, Swim, Workout, and other non-Ride activities are excluded from the heatmap. |
| AC-05 | GPS tracks from supported GPX and FIT files are processed and visualized. |
| AC-06 | The initial heatmap displays all eligible Ride activities with valid GPS data. |
| AC-07 | Deselecting a year removes rides from that year from the heatmap. |
| AC-08 | Deselecting a month removes rides from that month, subject to other filters. |
| AC-09 | Deselecting an individual ride removes its contribution to the heatmap. |
| AC-10 | The user can filter by the same month across multiple selected years. |
| AC-11 | Heatmap updates occur without a full page reload. |
| AC-12 | Frequently traversed roads show greater heatmap intensity. |
| AC-13 | Activity count reflects the currently filtered Ride activities. |
| AC-14 | Resetting filters restores the view of all eligible Ride activities. |
| AC-15 | Loading a new ZIP archive replaces the existing dataset and refreshes the visualization. |
| AC-16 | Invalid ZIP files or archives without eligible Ride GPS data produce a clear user-facing message. |
| AC-17 | A file that is not a ZIP archive, or is larger than the maximum supported size, is rejected before processing with a message that states the reason. |
| AC-18 | An activity listed more than once in the export appears once in the heatmap, ride list and statistics. Loading the same ZIP twice does not double any count. |
| AC-19 | The statistics show ride count, total distance, total elevation gain, total moving time and average distance per ride for the filtered rides, and update when filters change. |
| AC-20 | The user can choose a JSON, CSV or GeoJSON segment file from a dedicated Segments section. |
| AC-21 | A file with an unsupported type, invalid content or schema errors is rejected with a message that identifies the problem and the affected record; nothing is stored. |
| AC-22 | Before storing, the user sees each segment's ID, name, key figures and import status (new, update, unchanged), and can confirm or cancel. Cancelling stores nothing. |
| AC-23 | Confirmed segments, their route geometry and efforts are still available after the page is reloaded or the application restarted. |
| AC-24 | Importing a segment ID that already exists updates that segment; the segment list never shows the same ID twice and efforts are not duplicated. |
| AC-25 | The user can search segments by name, filter them by distance range, and sort them by distance, elevation gain or personal best. |
| AC-26 | A segment's detail view shows its metadata, its effort history, and identifies the personal best. The user can return to the list. |
| AC-27 | A segment's route is drawn on the map in a style distinct from the heatmap; changing heatmap filters does not change the segment overlay, and selecting a segment on the map opens its details. |
| AC-28 | The user can remove one segment or all segment data after confirming; removed data no longer appears after reload. |
| AC-29 | The application performs no network requests to Strava. |
| AC-30 | A segment file with altitude and distance samples is imported with them; samples that do not match the route are rejected as schema errors, and the stored samples are still available after a restart. |
| AC-31 | After upgrading, every segment that was stored in SQLite appears in the JSON segment catalog with its details, route, elevation values and efforts unchanged, and the migration does not run again. |
| AC-32 | Running the download command with a valid token for the user's segment IDs writes an upload file containing each segment's Strava name and full route streams; uploading it updates those segments by ID, shows their names and draws their road-following routes. An invalid token, a missing segment or the rate limit is reported without writing the token anywhere. |
| AC-33 | A segment without route geometry is shown on the map only by start and end markers, and its details state that the route is not available; statistics that the file lacks are computed from samples when present, marked as such, or shown as not available. |

## 6. User Experience

- Provide a ZIP file upload control.
- Reject unsupported or oversized files immediately, before processing starts.
- Display processing status while the archive is being inspected and parsed.
- Display the number of Ride activities successfully loaded.
- Clearly indicate if some activities could not be processed.
- Provide year, month, and individual ride filter controls.
- Display currently active filters.
- Provide a reset-to-all option.
- Display activity count and relevant summary statistics.
- Keep the map responsive while filters change.
- Provide a dedicated Segments section with: file upload, validation results, an import review step with confirm and cancel, a searchable, filterable and sortable segment list, a segment detail view with effort history and personal best, and remove actions that ask for confirmation.
- Show segment routes on the same map as the heatmap, in a distinct style, with the selected segment highlighted.

### User Stories

| ID | Story |
|---|---|
| US-01 | As a cyclist, I upload my Strava export ZIP and see where I ride most often, without preparing any files. |
| US-02 | As a cyclist, I narrow the heatmap to particular years, months or rides and see statistics for exactly those rides. |
| US-03 | As a cyclist, I upload a file with details of segments I care about, check what will be imported, and confirm it. |
| US-04 | As a cyclist, I later upload a newer file for the same segments to update their details and add new efforts, without creating duplicates. |
| US-05 | As a cyclist, I find a segment by name or distance, see my effort history and personal best, and see where it lies on the map next to my heatmap. |
| US-06 | As a cyclist, I remove segment data I no longer want stored on my machine. |

## 7. Data Requirements

### Input
- Original Strava export ZIP archive (rides).
- Segment import files prepared by the user (segments): JSON, CSV or GeoJSON.

### Supported GPS Formats
- GPX
- FIT

### Required Activity Information
Where available:
- Activity name.
- Activity classification/type.
- Activity date and time.
- Distance.
- Elevation gain.
- Moving time.
- GPS track points.

### Data Processing
- Validate the file type and size.
- Inspect the archive contents.
- Identify Ride activities using activity classification metadata.
- Associate Ride activities with their GPS files.
- Parse supported GPS formats.
- Normalize activity metadata and GPS tracks into an internal application data model.
- Keep each activity ID once.
- Exclude non-Ride activities from the visualization.
- Handle missing or malformed activity files without terminating the entire import process.

### Segment Data
Field names follow the Strava API where a Strava equivalent exists, so that segment details obtained from Strava can be used with little or no change. The full file specification is in `docs/segment-import-format.md`.

| Field | Required | Notes |
|---|---|---|
| Segment ID | Yes | Strava segment ID (positive integer). The unique key. |
| Name | Yes | |
| Distance (m), elevation gain (m), average and maximum grade (%), highest and lowest elevation (m) | No | |
| City, state, country | No | |
| Start and end coordinates | No | Latitude/longitude in degrees. |
| Route geometry | No | GeoJSON LineString/MultiLineString, or an encoded polyline, or a Strava `latlng` stream. |
| Altitude and distance samples | No | Strava `altitude` and `distance` streams, or altitude as the third GeoJSON coordinate; one value per route point (BR-29). |
| Personal best time (s), personal best date, effort count | No | As stated by the source. |
| Efforts | No | Per effort: start date-time and elapsed time (required), moving time, effort ID and activity ID (optional). |

Accepted file types:
- **JSON:** an array of segments, or an object with a `segments` array.
- **GeoJSON:** a FeatureCollection with one Feature per segment; segment fields are in `properties`.
- **CSV:** either one segment per row, or one effort per row (efforts must reference a segment that is in the same import or already stored).

### Data Storage
- Ride data is processed in the browser and held in memory only; it is not persisted.
- Segment data is stored in a local JSON segment catalog file on the user's machine (format: `docs/segment-catalog-format.md`). It is never sent to any external service.
- No other data is persisted: no ride data, no ride GPS tracks, and no Strava connection details (the application has no Strava connection, BR-28). The download command reads the user's access token from the environment or `.env.local` and does not save it (BR-31).

## 8. Technical Direction

Recorded in the ADRs (`docs/decisions/`):

- Frontend: React + TypeScript + Vite.
- Mapping: MapLibre GL JS (ADR-0008).
- Map tiles: OpenStreetMap-based tiles from OpenFreeMap, a free provider without keys that permits this use (ADR-0008). The public tile.openstreetmap.org service is not used.
- Route visualization: deck.gl (ADR-0006).
- ZIP processing: fflate, an equivalent of JSZip with streaming support (ADR-0004).
- GPX parsing: a small local parser; FIT parsing: Garmin FIT SDK (ADR-0004).
- State management: Zustand.
- Local backend: Node.js, serving a small JSON API on the local machine only (ADR-0009).
- Segment storage: a local JSON catalog file written by the local backend (ADR-0011). SQLite (ADR-0009) is read only once, to migrate segments stored by version 2.0 (BR-30).
- Testing: Vitest and Playwright.
- No Google Maps APIs or paid mapping services.

## 9. Visualization Modes — Open Design Decision

Consider supporting:

1. **Heatmap mode:** Emphasizes frequently traversed roads.
2. **Individual route mode:** Displays selected rides as distinct paths.

## 10. Non-Functional, Security and Privacy Requirements

| ID | Requirement |
|---|---|
| NFR-01 | The application runs locally as a personal application. |
| NFR-02 | The map stays responsive while filters change (about 2,000 rides, under 250 ms per filter change). |
| NFR-03 | No credentials, tokens or secrets are hardcoded or committed. Configuration uses environment variables, documented in `.env.example`. |
| NFR-04 | No Google Maps billing or paid mapping services are required. |
| NFR-05 | Automated tests cover ZIP processing, classification, GPS parsing, filtering, visualization data preparation, segment validation, segment persistence and the segment UI. |
| NFR-06 | Setup instructions explain how to run the application locally. |
| NFR-07 | Ride and segment data are processed and stored only on the user's machine. The local backend listens only on the local machine. |
| NFR-08 | The backend validates every request independently of the UI, limits request size, and returns errors without internal details. |
| NFR-09 | The user can remove all stored segment data from the application. The documentation explains where the catalog file is and that deleting it also removes all segment data. |

### Dependencies and Limitations
- Segment data is only as complete and current as the files the user uploads; the application never refreshes it from Strava.
- Encoded polylines are decoded with the common encoded polyline algorithm (precision 5) used by Strava. Other encodings are not supported; GeoJSON is the recommended geometry format.
- Personal best and effort history reflect only the efforts included in the uploaded files.
- The segment features need the local backend to be running; the ride heatmap works without it.

### Error Scenarios
| Scenario | Expected behaviour |
|---|---|
| ZIP file not a ZIP, corrupt, too large, or without eligible rides | Clear message; previous dataset kept where possible (AC-16, AC-17). |
| Segment file of an unsupported type, unreadable, or not matching the schema | Rejected with the problems listed per record; nothing stored (AC-21). |
| Efforts that reference an unknown segment | Rejected as a schema error (AC-21). |
| Local backend not running, or the catalog file unreadable or not a catalog | The Segments section explains that segment storage is unavailable; the heatmap keeps working. Such a file is never overwritten. |
| Catalog with missing or malformed entries or fields | The usable segments load; invalid values are treated as unknown and unusable entries are skipped, each reported in the server log; the original file is kept as a backup before it is next rewritten. |

## 11. Definition of Done

- The application accepts the original Strava export ZIP archive.
- File type and size are validated before processing.
- ZIP extraction and activity identification are automated.
- Only Ride activities are included in cycling visualization and statistics.
- GPX and FIT GPS tracks are processed.
- Filters combine correctly and update the map dynamically.
- Heatmap intensity reflects route traversal frequency.
- Segment files can be validated, reviewed, imported, updated, browsed, shown on the map and removed, with data persisted in the local JSON segment catalog, including altitude and distance samples when provided, and segments from SQLite migrated.
- The application makes no Strava API calls; only the optional download command does, with the user's own token.
- Automated tests cover ZIP processing, activity classification, GPS parsing, filtering, visualization data preparation, and the segment capability.
- Setup instructions explain how to run the application locally, where segment data is stored and how to remove it.
- No API secrets are committed to the repository.

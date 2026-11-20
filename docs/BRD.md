# Business Requirements Document (BRD)
## Strava Cycling Ride Analyzer — Personal Heatmap and Segments

**Version:** 2.4  
**Status:** Draft — v2.4 approved for implementation by the owner (2026-11-20)

### Change History

| Version | Date | Summary |
|---|---|---|
| 1.0 | 2026-11-14 | Initial BRD: heatmap from a Strava activities CSV. |
| 1.1 | 2026-11-14 | Input changed to the original Strava export ZIP archive. |
| 2.0 | 2026-11-15 | Adds ZIP file validation (BR-17), duplicate-ride protection (BR-18), extended ride statistics (BR-19) and a manually imported **Segments** capability stored in local SQLite (BR-20 – BR-28). Strava OAuth and Strava API access are explicitly out of scope: segment data is uploaded by the user. Adds user stories, non-functional, security and privacy requirements, and updates the technical direction to the implemented stack. |
| 2.1 | 2026-11-15 | Segment data is stored in a local **JSON segment catalog** file instead of SQLite (BR-23, ADR-0011). Segments can include altitude and distance samples along the route (BR-29, RULE-19). Segments stored in SQLite by version 2.0 are migrated into the catalog once, without loss (BR-30). Ride data is still not persisted. Segment matching and ride analysis against the catalog are recorded as an open decision (OD-26) until specified. |
| 2.2 | 2026-11-15 | Adds an optional, separate command that downloads the user's segment details, names and route streams from Strava with the user's own access token into an upload file (BR-31); the application itself still never contacts Strava (BR-28 revised). Segments without route geometry are shown by their start and end only, never as a straight line (BR-26 revised). Missing segment statistics are derived from altitude and distance samples, never estimated otherwise (RULE-20). |
| 2.3 | 2026-11-19 | Rides are **stored** in a local SQLite database and restored at startup (BR-33). Each Strava export ZIP upload is **added** to the ride history instead of replacing it (BR-16, BR-18 revised). An upload registry and an Uploads screen let the user delete one, several or all uploads (BR-34 – BR-36). Files already imported are detected by their hash (BR-37). Deterministic analytics over the stored tracks are added for later use by an assistant; no chatbot is built (BR-38). The segment catalog, BR-30 and BR-31 are unchanged. BR-32 is reserved for map styles (pending, OD-27). |
| 2.4 | 2026-11-20 | Adds an optional, **local** AI assistant that answers questions about the stored ride history through the BR-38 analytics, which the model calls as tools (BR-39, BR-45). It runs on the user's own **Ollama** server, behind a provider interface that later providers can implement (BR-40). Ollama connection settings (BR-41), model management: installed models, download, removal, selection (BR-42), capability detection and a model test (BR-43). All inference is local; no cloud provider, cloud model or API key is used (BR-44). Conversations are kept in memory only. NFR-03, NFR-05 and NFR-07 revised; NFR-11 and NFR-12 added. Segment matching (the segment part of BR-38) stays deferred. |

## 1. Business Objective

Build a personal web application that visualizes cycling activities from a Strava export ZIP archive on an interactive map. Users should be able to filter activities by year, month, and individual ride, with the heatmap updating dynamically.

The application must automatically extract the ZIP archive, identify activities classified as Ride, and process their GPS tracks. Users should not need to manually extract files or prepare a separate data file.

In addition, users can manually import details of Strava segments they care about (metadata, route geometry and their own efforts and personal bests), keep them in a local database, browse them, and see their routes on the same map. The application never connects to Strava.

Rides from every uploaded export are kept on the user's machine and build up a ride history over time. The user can see and delete the uploads they came from, and the application provides deterministic analytics over that history.

An optional assistant answers questions about the ride history in plain language. It uses the application's own analytics, so its numbers are computed, not estimated, and it runs on a language model on the user's own machine, so no ride data leaves it.

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
- Allow users to upload Strava export ZIP archives over time; each upload adds its rides to a stored ride history.
- Store the ride history and an upload registry in a local SQLite database; list and delete uploads.
- Provide deterministic analytics over the stored ride history.
- Provide an assistant that answers questions about the stored ride history using those analytics, with a language model running locally in Ollama.
- Provide assistant settings: the Ollama server, connection status and test, installed models, model download and removal, and model selection.
- Manually import Strava segment details from JSON, CSV or GeoJSON files.
- Store imported segment data locally in a JSON segment catalog file; browse, search, filter, inspect and remove it.
- Display segment routes on the map.
- Run locally as a personal application.

### Out of Scope
- Strava OAuth authentication and any Strava API access by the application, including segment discovery or retrieval. (The separate, optional download command of BR-31 is the only exception.)
- Automatic synchronization or refresh of activities or segments from Strava; background sync.
- Automatic discovery of segments from the imported rides.
- Cloud AI providers (such as OpenAI, Anthropic, Google Gemini or OpenRouter) and Ollama cloud models. The provider interface allows adding providers in a later version.
- An Ollama server on another machine (provisional, OD-36).
- Assistant actions that change data: the assistant only reads analytics results; it never changes rides, uploads, segments or settings.
- Automatic switching between models.
- Segment matching in the assistant, until the segment part of BR-38 is delivered.
- Looking up place names (geocoding); the assistant works with coordinates (provisional, OD-34).
- Keeping assistant conversations after the application stops.
- Uploading individual GPX or FIT files outside an export ZIP.
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
| Assistant (optional) | BR-38 analytics over the stored ride history; answers written by a model in the user's local Ollama | No |

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
| BR-16 | Additional Uploads | Allow the user to upload further Strava export ZIP archives at any time. Each upload's rides are added to the stored ride history and the application refreshes without reloading. An upload never replaces or removes stored rides. |
| BR-17 | ZIP File Validation | Before processing, validate that the selected file is a ZIP archive and does not exceed the maximum supported size. |
| BR-18 | Duplicate Ride Protection | Each Strava activity appears at most once in the ride history, even if an export lists it more than once or several uploads contain it. |
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
| BR-33 | Ride Persistence | Store every imported ride, with its details and complete GPS track, and the upload it came from, in a local SQLite database, so that all previously uploaded rides are shown again when the application restarts. |
| BR-34 | Upload Registry | Record each upload with a unique upload ID, the original file name, the upload date and time, the file's hash, the number of rides imported from it, their total distance and the import status (importing, complete, completed with skipped activities, failed). |
| BR-35 | Upload Management | Provide an Uploads screen listing every upload with its registry details. The user can delete one upload, select several and delete them together, or delete all uploads after confirming. |
| BR-36 | Upload Deletion | Deleting uploads removes only the rides and GPS tracks that no remaining upload contains; rides and tracks that another upload also contains are kept. A deletion is atomic: either all selected uploads are removed or none is. |
| BR-37 | Duplicate File Detection | Calculate a hash of each uploaded file. If a file with the same hash was already imported, warn the user and do not import it again. A different file is imported even if its rides overlap stored rides; overlapping rides are not duplicated (BR-18). |
| BR-38 | Ride Analytics | Provide deterministic analytics over the stored ride history: distance by month and by year, how many rides passed a given location, the most frequently ridden roads, comparison between two periods, and rides that rode a stored segment. Results are computed by the application's own functions from stored tracks, never estimated, and are available through the local API for later use by an assistant. |
| BR-39 | Ride Assistant | Provide an assistant in which the user asks questions in plain language about the stored ride history. Answers are based on the BR-38 analytics, which the language model calls as tools: distance by month and by year, location visits, the most frequently ridden roads, and comparison between two periods. Segment matching is offered to the assistant only once it is delivered. The assistant only reads data. |
| BR-40 | AI Provider Interface | Connect the assistant to language models through one common provider interface. Ollama is the first and, in this version, the only provider. A later provider can be added without changing the assistant's orchestration, the analytics, GPS processing, the database repositories or the chat screen. |
| BR-41 | Ollama Connection | Provide settings for the Ollama server address (default `http://127.0.0.1:11434`), show whether Ollama is reachable and its version, and let the user test the connection. When Ollama is not reachable, the assistant explains how to start or install it; all other features keep working. |
| BR-42 | Model Management | Show the models installed in Ollama with their size, parameter size, quantization, context window and capabilities. Let the user download a model by name with progress shown and the option to cancel, remove an installed model after confirming, select the preferred model, and find models to download (OD-35). A selected model that is no longer installed is reported and must be selected again. |
| BR-43 | Model Capabilities | Detect, for each model, whether it supports tool calling, streaming and structured output, and its context window. Let the user test a model to check that it calls the analytics tools correctly. A model without tool calling is marked and not used for ride questions; the limitation is explained and the user can select another model. |
| BR-44 | Local-Only Inference | All language-model inference runs in the local Ollama server. Prompts, ride data, coordinates and analytics results are never sent to a cloud service. Ollama cloud models are not offered, downloaded or used. No API key or cloud account is needed. |
| BR-45 | Assistant Answers | Stream answers as they are written, show which analytics each answer used, and let the user stop an answer. Timeouts, invalid responses and model errors are shown as plain messages. |

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
- A Strava activity ID appears at most once in the stored ride history, across all uploads (RULE-12).
- Statistics include only rides for which the value is known; a ride without a known value still counts as a ride (RULE-13).
- A segment is identified by its Strava segment ID; there is at most one stored record per ID (RULE-14).
- A segment import is all-or-nothing: if any record is invalid, nothing from that file is stored (RULE-15).
- Re-importing a segment replaces the details provided in the new file and keeps existing efforts; an effort is identified by its effort ID, or by its start time and elapsed time when it has no ID (RULE-16).
- A segment's personal best is its fastest recorded effort; if no efforts are provided, the personal best stated in the file is used (RULE-17).
- Segment data never changes the ride heatmap or ride statistics (RULE-18).
- A statistic stated in the uploaded file is shown as given. A missing distance, elevation gain, average or maximum grade, or elevation range is computed from the route's altitude and distance samples when they exist, and marked as computed; otherwise it is shown as not available. No statistic is estimated in any other way (RULE-20).
- Altitude and distance samples belong to the route they were provided with: they must have one value per route point (distances never decreasing). A later import with a different route replaces them, with none if it provides none (RULE-19).
- A ride belongs to every upload that contains its activity ID. It is stored once and is removed only when no upload containing it remains (RULE-21).
- When an activity already stored arrives in a new upload, its details (name, date, distance, elevation gain, moving time) are replaced by the new upload's values and its stored GPS track is kept (RULE-22).
- Two files are the same file when their SHA-256 hashes are equal. A failed upload does not count as imported (RULE-23).
- Analytics results come only from stored data and are reproducible. A location visit is a distinct ride passing within the given radius of the location (default 100 m). A ride rode a segment when it passes within 25 m of the segment's start, later within 25 m of its end, and stays within 25 m of every route point between them, in that direction; only segments with route geometry can be matched. Statistics without a known value follow RULE-13 (RULE-24).
- Numbers and facts about the user's rides in an assistant answer come only from analytics tool results; the assistant never calculates them from GPS data or estimates them, and says when the analytics cannot answer a question (RULE-25).
- A question is sent only when Ollama is reachable and the selected model is installed, local and supports tool calling. Otherwise nothing is sent; the user is told why and selects again. The model is never changed without the user (RULE-26).
- A model is local when Ollama lists it without a remote host or remote model and its name has no cloud suffix (`:cloud`, `-cloud`). Only local models are listed as usable, downloaded or used. The Ollama server address must be on the user's machine (RULE-27).

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
| AC-15 | Uploading another ZIP archive adds its rides to the ride history; previously stored rides stay, and the heatmap, ride list and statistics include both. |
| AC-16 | Invalid ZIP files or archives without eligible Ride GPS data produce a clear user-facing message. |
| AC-17 | A file that is not a ZIP archive, or is larger than the maximum supported size, is rejected before processing with a message that states the reason. |
| AC-18 | An activity listed more than once in an export, or contained in several uploads, appears once in the heatmap, ride list and statistics. |
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
| AC-34 | After rides are uploaded and the application is restarted, the same rides, heatmap and statistics are shown without uploading again. |
| AC-35 | Uploading a second, different export adds its new rides; rides from the first upload are still shown. |
| AC-36 | The Uploads screen shows each upload's file name, upload date and time, ride count, total distance and status. |
| AC-37 | Deleting one upload removes the rides only it contained from the heatmap, ride list and statistics, and they stay removed after a restart. Rides also in another upload remain. |
| AC-38 | The user can select several uploads and delete them in one action. |
| AC-39 | "Delete all" asks for confirmation, then removes every upload and all ride data. Cancelling removes nothing. |
| AC-40 | If a deletion fails part-way, no upload, ride or track is removed. |
| AC-41 | Uploading a file that was already imported shows a warning naming the earlier upload, and nothing is imported. |
| AC-42 | For a synthetic ride history, each analytics function returns the expected result, and repeated calls return the same result. |
| AC-43 | For a synthetic history, a question about distance per month is answered with numbers equal to the analytics result, and the answer shows which analytics were used. |
| AC-44 | When the model calls an analytics function with invalid arguments, nothing is computed from them and the model is told what was wrong. When the analytics cannot answer a question, the assistant says so instead of estimating. |
| AC-45 | The Ollama adapter and a mocked provider pass the same provider tests (text, streaming, tool calls, errors), and the orchestration, analytics and chat screen contain no Ollama-specific code. |
| AC-46 | When Ollama is not running or the address is wrong, the settings and the assistant say it is not reachable and how to start it; testing the connection shows the version when it is reachable. The map, uploads and analytics keep working. |
| AC-47 | Installed models are listed with size, parameter size, quantization, context window and capabilities. A selected model that is no longer installed is reported, and the question is not sent. |
| AC-48 | Downloading a model shows progress and can be cancelled; a completed download appears in the installed list; a failed download is reported. |
| AC-49 | Removing a model asks for confirmation and removes it from the list; if it was selected, the selection is cleared and the user is told. |
| AC-50 | A model without tool calling is marked; asking with it explains the limitation and sends nothing. Testing a model reports whether it called an analytics tool correctly. A model without streaming still answers, in one piece. |
| AC-51 | Cloud models are not offered, cannot be downloaded or selected, and an Ollama address that is not on the user's machine is rejected. |
| AC-52 | Answer text appears as it is written; Stop ends the answer and cancels the request to Ollama. |
| AC-53 | A timeout, an invalid response or a model error shows a plain message; the map, uploads and analytics keep working. |

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
- Provide an Uploads section listing the upload registry, with a checkbox per upload, "Delete selected", "Delete all", a confirmation step for each deletion, and a warning when a file was already imported.
- Provide an Assistant section with a chat (streamed answers, the analytics used, Stop) and settings: Ollama address, connection status and test, installed models with details, model download with progress and cancel, model removal with confirmation, model selection, and a model test.

### User Stories

| ID | Story |
|---|---|
| US-01 | As a cyclist, I upload my Strava export ZIP and see where I ride most often, without preparing any files. |
| US-02 | As a cyclist, I narrow the heatmap to particular years, months or rides and see statistics for exactly those rides. |
| US-03 | As a cyclist, I upload a file with details of segments I care about, check what will be imported, and confirm it. |
| US-04 | As a cyclist, I later upload a newer file for the same segments to update their details and add new efforts, without creating duplicates. |
| US-05 | As a cyclist, I find a segment by name or distance, see my effort history and personal best, and see where it lies on the map next to my heatmap. |
| US-06 | As a cyclist, I remove segment data I no longer want stored on my machine. |
| US-07 | As a cyclist, I upload a newer export later, and my history keeps every earlier ride without duplicates. |
| US-08 | As a cyclist, I see which files I uploaded, and I remove one, several or all of them. |
| US-09 | As a cyclist, I ask questions about my riding history in plain language and get answers computed from my own rides. |
| US-10 | As a cyclist, I choose, download and remove the local model that answers me, and my ride data never leaves my machine. |

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
- Ride data is processed in the browser. Ride details, GPS tracks and the upload registry are stored in a local SQLite database file on the user's machine (ADR-0013). The uploaded ZIP files themselves are not kept.
- Segment data is stored in a local JSON segment catalog file on the user's machine (format: `docs/segment-catalog-format.md`). It is never sent to any external service.
- Assistant settings (Ollama address, selected model) are stored in a local settings file written by the local backend. Assistant conversations are kept in the backend's memory only and are lost when it stops. Downloaded models are stored by Ollama in its own model folder; removing a model in the application deletes it there.
- No other data is persisted: no ZIP files, no API keys, and no Strava connection details (the application has no Strava connection, BR-28). The download command reads the user's access token from the environment or `.env.local` and does not save it (BR-31).

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
- Ride storage: a local SQLite database (`node:sqlite`) written by the local backend (ADR-0013).
- Language models: Ollama on the user's machine, called through its native HTTP API with `fetch` from the local backend, behind a common `LLMProvider` interface; no SDKs (ADR-0014).
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
| NFR-03 | No credentials, tokens or secrets are hardcoded or committed. Configuration uses environment variables, documented in `.env.example`. The assistant needs no credentials (NFR-11). |
| NFR-04 | No Google Maps billing or paid mapping services are required. |
| NFR-05 | Automated tests cover ZIP processing, classification, GPS parsing, filtering, visualization data preparation, segment validation, segment persistence, the segment UI, ride persistence, upload management, analytics and the assistant. Assistant tests use mocked Ollama HTTP responses and need no running Ollama. |
| NFR-06 | Setup instructions explain how to run the application locally. |
| NFR-07 | Ride and segment data are processed and stored only on the user's machine. The local backend listens only on the local machine. The assistant sends data only to the Ollama server on the same machine (BR-44). |
| NFR-08 | The backend validates every request independently of the UI, limits request size, and returns errors without internal details. |
| NFR-09 | The user can remove all stored segment data and all stored ride data from the application. The documentation explains where the segment catalog and the ride database are, and that deleting them while the application is stopped removes that data. |
| NFR-10 | With about 2,000 stored rides, the stored history is restored and shown in under 5 s after the application starts, and a location-visit query answers in under 500 ms. NFR-02 still applies to filter changes. |
| NFR-11 | The assistant requires no API key, account or cloud service, and the application contacts no AI service other than the local Ollama server. Model downloads are performed by Ollama from its own registry and contain no user data. |
| NFR-12 | Requests to Ollama have time limits. Unavailability, timeouts, invalid responses and model errors are shown as plain messages and never affect the map, uploads or analytics. No request is retried with another model. |

### Dependencies and Limitations
- Segment data is only as complete and current as the files the user uploads; the application never refreshes it from Strava.
- Encoded polylines are decoded with the common encoded polyline algorithm (precision 5) used by Strava. Other encodings are not supported; GeoJSON is the recommended geometry format.
- Personal best and effort history reflect only the efforts included in the uploaded files.
- The segment features and the ride history need the local backend to be running.
- The assistant needs Ollama installed and running on the same machine, and a downloaded model that supports tool calling. Answer speed and quality depend on the model and the machine; the numbers come from the analytics (RULE-25).
- Models are large downloads (typically several GB) and use disk space and memory.

### Error Scenarios
| Scenario | Expected behaviour |
|---|---|
| ZIP file not a ZIP, corrupt, too large, or without eligible rides | Clear message; previous dataset kept where possible (AC-16, AC-17). |
| Segment file of an unsupported type, unreadable, or not matching the schema | Rejected with the problems listed per record; nothing stored (AC-21). |
| Efforts that reference an unknown segment | Rejected as a schema error (AC-21). |
| Local backend not running, or the catalog file unreadable or not a catalog | The Segments section explains that segment storage is unavailable; the heatmap keeps working. Such a file is never overwritten. |
| Ride database unavailable, unreadable or newer than the application | The application says ride history is unavailable and does not import uploads; segment features keep working. Such a file is never overwritten. |
| Upload fails while its rides are stored | Nothing from it is stored; the registry shows it as failed. |
| Same file uploaded again | A warning names the earlier upload; nothing is imported. |
| Ollama not installed, not running or not reachable | The assistant and its settings say Ollama is not reachable and how to start it; everything else keeps working. |
| Selected model not installed, removed, or without tool calling | The question is not sent; the user is asked to select or download a model. |
| Model download fails or is cancelled | The failure is reported; a partial download is not listed as installed. |
| Ollama times out or returns an invalid response | A plain message; the question can be asked again. |
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
- Rides persist across restarts; uploads accumulate without duplicate rides; uploads can be listed and deleted (one, several, all) atomically; files already imported are detected.
- Analytics return deterministic results from the stored ride history.
- The assistant answers ride questions through the analytics with a local Ollama model behind the common provider interface; models can be listed, downloaded, removed, selected and tested; nothing is sent to a cloud service.
- No API secrets are committed to the repository.

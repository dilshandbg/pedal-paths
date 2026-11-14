# Business Requirements Document (BRD)
## Strava Cycling Ride Analyzer — Personal Heatmap

**Version:** 1.1  
**Status:** Draft

## 1. Business Objective

Build a personal web application that visualizes cycling activities from a Strava export ZIP archive on an interactive map. Users should be able to filter activities by year, month, and individual ride, with the heatmap updating dynamically.

The application must automatically extract the ZIP archive, identify activities classified as Ride, and process their GPS tracks. Users should not need to manually extract files or prepare a separate data file.

## 2. Scope

### In Scope
- Accept the original Strava export ZIP archive as the primary input.
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
- Run locally as a personal application.

### Out of Scope (Initial Release)
- Strava OAuth integration.
- Automatic synchronization with Strava.
- Social sharing.
- Mobile application support.
- Live GPS tracking.
- Heart-rate or power analysis.

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

## 4. Business Rules

- The original Strava export ZIP archive is the primary data source.
- The application must not require a separately prepared input file.
- The application must identify Ride activities based on the activity classification information available in the export archive.
- Only Ride activities contribute to the heatmap and cycling statistics.
- Non-Ride activities must be excluded.
- GPS data must be extracted from supported GPX and FIT files.
- Activities without usable GPS track data should not contribute to the heatmap, but should be handled gracefully.
- Year, month, and individual ride filters must combine to determine the matching activities.
- If a year or month filter is unrestricted, all values for that dimension are included.
- Heatmap intensity must reflect repeated route traversal.
- Filter changes must update the visualization without a full page reload.

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

## 6. User Experience

- Provide a ZIP file upload control.
- Display processing status while the archive is being inspected and parsed.
- Display the number of Ride activities successfully loaded.
- Clearly indicate if some activities could not be processed.
- Provide year, month, and individual ride filter controls.
- Display currently active filters.
- Provide a reset-to-all option.
- Display activity count and relevant summary statistics.
- Keep the map responsive while filters change.

## 7. Data Requirements

### Input
- Original Strava export ZIP archive.

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
- GPS track points.

### Data Processing
- Inspect the archive contents.
- Identify Ride activities using activity classification metadata.
- Associate Ride activities with their GPS files.
- Parse supported GPS formats.
- Normalize activity metadata and GPS tracks into an internal application data model.
- Exclude non-Ride activities from the visualization.
- Handle missing or malformed activity files without terminating the entire import process.

## 8. Proposed Technical Direction (Non-binding)

- Frontend: React + TypeScript + Vite.
- Mapping: Leaflet.
- Map tiles: OpenStreetMap-compatible tile provider.
- Heatmap: Leaflet.heat or a suitable alternative.
- ZIP processing: JSZip or an equivalent ZIP library.
- GPX parsing: suitable GPX parsing library.
- FIT parsing: suitable FIT parsing library.
- State management: Zustand or an equivalent lightweight solution.
- Testing: Vitest and Playwright.
- Application should run locally without requiring Google Maps billing.

## 9. Visualization Modes — Open Design Decision

Consider supporting:

1. **Heatmap mode:** Emphasizes frequently traversed roads.
2. **Individual route mode:** Displays selected rides as distinct paths.

## 10. Definition of Done

- The application accepts the original Strava export ZIP archive.
- ZIP extraction and activity identification are automated.
- Only Ride activities are included in cycling visualization and statistics.
- GPX and FIT GPS tracks are processed.
- Filters combine correctly and update the map dynamically.
- Heatmap intensity reflects route traversal frequency.
- Automated tests cover ZIP processing, activity classification, GPS parsing, filtering, and visualization data preparation.
- Setup instructions explain how to run the application locally.
- No API secrets are committed to the repository.
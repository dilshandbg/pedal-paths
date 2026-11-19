# BRD v2.3: gap analysis and implementation plan

- Date: 2026-11-19
- Baseline: `main` at `6142c18`, with BRD v2.2 implemented
- Status: **Approved 2026-11-19; phase 1 in progress.** BRD v2.3 and [ADR-0013](decisions/0013-persistent-ride-history-sqlite.md).

## 1. Gap analysis

| Request                    | Current state                                                                         | Gap                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Persistent GPS storage     | Rides live only in `activitiesStore` (memory). `server/` stores segments in JSON only | New ride database, repository and API; restore at startup                               |
| Cumulative uploads         | `loadArchive` replaces the dataset (BR-16, AC-15); tests assert replacement           | Add, never replace; rebuild the heat map index over the history; keep filters           |
| Upload registry and screen | None; only `dataset.fileName`                                                         | `uploads` table, `/api/uploads`, Uploads section with single, multiple and all deletion |
| Data relationships         | Activity ID is unique per ZIP (BR-18)                                                 | `upload_rides` shared ownership; tracks with their ride; transactional delete           |
| Duplicate detection        | None across files                                                                     | Incremental SHA-256 in the worker; hash check before storing                            |
| Analytics                  | Only filter statistics (`summarizeActivities`)                                        | `features/analytics` pure functions + `/api/analytics/*`                                |
| Segment matching           | OD-26 open; catalog holds routes                                                      | Defined by RULE-24 (OD-28)                                                              |
| Performance                | `npm run perf` measures filter changes                                                | Indexes (ADR-0013 §2, §5); restore and query benchmarks                                 |
| Keep segments / Strava     | JSON catalog, BR-30 migration, `fetch-segments`                                       | Unchanged; separate database file                                                       |
| Migration                  | No ride data has ever been stored                                                     | Nothing to migrate; versioned schema with a backup before each upgrade                  |

## 2. Phases

Each phase is its own `feature/*` branch, merged into `dev` after `/verify` passes, with
traceability updated in the same change.

1. **Ride storage backend** (BR-33, BR-34, BR-36, RULE-21). **Done** on `feature/ride-storage`.
   - `server/rides/`: `rideDatabase` (migrations, backup copy, newer-version refusal),
     `rideRepository`, `validateUpload`; `server/http/ridesApi` + `apiSupport` (shared with the
     segment API); `ridesApiPlugin` with `RIDES_DB_PATH`.
   - Pure, shared with the browser: `src/services/ride-history/` (`trackCodec`, `rideBundle`,
     `rideCells`).
   - Tests: unit (codec, bundle, cells) and `tests/server` (database, repository, validation, API),
     covering shared rides, deletion keeping shared rides, rollback (AC-40), crash recovery and
     migration backup.
   - Changed from the ADR draft: no R*Tree (the cell index covers area queries); date index widened
     for the restore order (ADR-0013 §2).
2. **Cumulative import in the app** (BR-16, BR-18, BR-37, AC-15, AC-18, AC-34, AC-35, AC-41).
   **Done** on `feature/cumulative-import`.
   - Import worker: `prepareUpload` (ZIP → ride bundle, incremental `sha256` on the same stream) and
     `restoreHistory` (decode + heat map index over the whole history).
   - `rideHistoryClient`; `activitiesStore` holds history, uploads and the latest upload's summary.
     It loads the history at start, stores each upload first and then reads the history back.
     Uploads stay possible while the history loads.
   - The duplicate-file warning names the earlier upload. Storage unavailable → message, nothing
     imported. Filters are kept.
   - Tests: an in-memory `fakeRideHistory` for store and UI tests. E2E: each test gets its own real
     ride API over an in-memory database (`tests/e2e/test.ts`).
3. **Upload management screen** (BR-35, BR-36, AC-36 – AC-40, NFR-09). **Done** on
   `feature/upload-management`.
   - An **Uploads** tab (`UploadsSection`, presentational `UploadList`): file name, date and time,
     rides (new), distance and status in words; a checkbox per upload, a confirmed delete per
     upload, "Delete selected" and "Delete all uploads" (`ConfirmAction`).
   - `activitiesStore.deleteUploads` / `deleteAllUploads` with their own deletion status; the
     history is read back after each deletion; a `not-found` failure refreshes the list.
   - Deleted rides leave the ride filter (`withoutRemovedRides`); uploads are disabled while a
     deletion runs.
4. **Analytics** (BR-38, AC-42). **Done** on `feature/ride-analytics`, except segment matching
   (phase 6).
   - Pure, in `src/features/analytics/services`: `distanceByMonth`, `distanceByYear`, `totalRides`,
     `countLocationVisits` (exact distance to the track's lines, recording gaps excluded),
     `rankRoadFrequency`, `comparePeriods`, `parseAnalyticsQuery`.
   - Backend: `createRideAnalytics` over new repository queries (`listRideDetails`, `ridesInCells`,
     `ridesWithTracks`, `cellVisits`); read-only `GET /api/analytics/*` with a function catalog at
     `GET /api/analytics`.
   - One-off timing at 2,000 rides × 3,000 points: location visits (100 m) 55–106 ms; a 2 km
     radius over a dense area ~1.4 s (every ride is a candidate). For phase 5 to look at.
5. **Performance** (NFR-10): extend `npm run perf` with restore and location-query timings at about
   2,000 synthetic rides; tune indexes or the cell size if needed.
6. **Segment matching** (BR-38, RULE-24; definition approved in OD-28).
7. **Docs:**
   - Merge the proposal into `docs/BRD.md` as v2.3 (at approval, before phase 1).
   - Update `architecture.md`, `technical-design.md` and the README section "Removing stored data".

## 3. Owner decisions (OD-28 – OD-32, all approved 2026-11-19 as proposed)

| OD    | Question                                                                                                                                         | Proposal                                                                                                                                                                                                                                              |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OD-28 | What does "segment matching" mean?                                                                                                               | A ride matches a catalog segment that has a route when it passes within 25 m of the start, later within 25 m of the end, and stays within 25 m of every route point between them, in the same direction. Output: matching rides and dates per segment |
| OD-29 | The same activity appears in two uploads with different details (for example renamed on Strava). Which details win?                              | The newest upload's details; the track is kept (RULE-22)                                                                                                                                                                                              |
| OD-30 | Performance numbers for restore and location search                                                                                              | Restore of 2,000 rides under 5 s; location query under 500 ms (NFR-10)                                                                                                                                                                                |
| OD-31 | Ride database unavailable: refuse uploads, or show the upload in memory with a "not saved" warning?                                              | Refuse, so the history is never silently incomplete                                                                                                                                                                                                   |
| OD-32 | "Location visits": count distinct rides or individual passes, and with which default radius? "Historical comparison": which metrics and periods? | Distinct rides, default radius 100 m. Compare distance, ride count, elevation gain, moving time or location visits between two date ranges                                                                                                            |
| —     | GPS points as one blob per ride instead of one row per point (ADR-0013 §3)                                                                       | Blob, with a cell index and an R*Tree for coordinate searches                                                                                                                                                                                         |

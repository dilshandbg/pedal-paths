# 0013. Persistent, cumulative ride history in SQLite

- Status: Accepted (owner decision, BRD v2.3, 2026-11-19)
- Date: 2026-11-19
- Amends: [ADR-0004](0004-strava-zip-ingestion-pipeline.md) (a new ZIP is added to the history
  instead of replacing the dataset), [ADR-0005](0005-filter-semantics.md) (filters are kept when an
  upload is added), and the "rides are not persisted" part of [ADR-0011](0011-json-segment-catalog.md).
  The segment catalog itself stays a JSON file, unchanged.
- Related requirements: BR-16, BR-18, BR-33 – BR-38, RULE-12, RULE-21 – RULE-24,
  AC-15, AC-18, AC-34 – AC-42, NFR-07, NFR-09, NFR-10

## Context

The owner wants ride history to be kept and to grow over time. Uploaded GPS tracks are stored and
restored when the app restarts. A new upload is added to the stored rides and never replaces them.
Every upload is recorded in a registry and can be deleted on its own, several at a time, or all at
once. A file that was already imported is detected by its hash. Deterministic analytics run over the
stored tracks, so that a later chatbot can call them instead of working on raw GPS data.

Owner decisions on 2026-11-19:

1. An upload is one Strava export ZIP (BR-01 is unchanged). Single GPX/FIT files are not uploads.
2. Strava exports are cumulative, so a newer export repeats every older ride. A ride is stored
   **once**, linked to every upload that contains it, and counted once. Deleting an upload removes a
   ride only when no remaining upload contains it.
3. Only the deterministic analytics services and their local API are built now. No chatbot, and no
   language-model integration.
4. No IndexedDB. The JSON segment catalog, the BR-30 migration and the `fetch-segments` command stay
   as they are.

Scale to design for: one person, about 2,000 rides now and growing (NFR-02), with 1–10k points per
ride. That is roughly 2–20 million GPS points.

## Decision

### 1. Storage

- A new SQLite database file, `data/rides.sqlite` by default (git-ignored, under `data/`), which
  `RIDES_DB_PATH` can change. It uses `node:sqlite`, which `server/db` already uses, so no new
  dependency is added. It is a separate file from the legacy `data/segments.sqlite` (the BR-30
  migration source) and from the JSON segment catalog.
- Only the local backend writes it, through a `RideRepository` in `server/rides/`, behind new
  `/api/uploads` and `/api/rides` routes. These use the loopback-only, origin-checked and
  size-limited middleware the segment API already uses (NFR-07, NFR-08).
- Connections set `PRAGMA foreign_keys = ON` and `journal_mode = WAL`.

### 2. Schema (migration 1)

The authoritative schema is `RIDE_MIGRATIONS` in `server/rides/rideDatabase.ts`. In outline:

```sql
CREATE TABLE uploads (            -- the upload registry (BR-34)
  upload_id TEXT PRIMARY KEY,     -- random UUID
  file_name, file_size_bytes, file_hash /* SHA-256 hex */, uploaded_at /* ISO UTC */,
  status CHECK (status IN ('importing', 'complete', 'partial', 'failed')),
  ride_count, new_ride_count, total_distance_km, skipped_count, excluded_non_ride_count
) STRICT;
CREATE INDEX uploads_by_hash ON uploads (file_hash, status);
CREATE INDEX uploads_by_date ON uploads (uploaded_at);

CREATE TABLE rides (
  activity_id TEXT PRIMARY KEY,   -- Strava Activity ID (ADR-0007)
  name, start_date /* ISO UTC */, distance_km, elevation_gain_m, moving_time_s,
  point_count, min_lat, max_lat, min_lng, max_lng,   -- bounding box
  track BLOB NOT NULL,            -- encoded GPS points, see §3
  updated_by_upload TEXT REFERENCES uploads ON DELETE SET NULL  -- whose details are stored (RULE-22)
) STRICT;
CREATE INDEX rides_by_start_date ON rides (start_date, activity_id);

-- Many-to-many: a ride belongs to every upload that contains it (RULE-21).
CREATE TABLE upload_rides (
  upload_id   TEXT REFERENCES uploads ON DELETE CASCADE,
  activity_id TEXT REFERENCES rides   ON DELETE CASCADE,
  PRIMARY KEY (upload_id, activity_id)
) STRICT, WITHOUT ROWID;
CREATE INDEX upload_rides_by_activity ON upload_rides (activity_id);

-- Location index: the grid cells each ride passes through (§5).
CREATE TABLE ride_cells (
  cell_key    INTEGER,            -- fixed 0.001° grid cell
  activity_id TEXT REFERENCES rides ON DELETE CASCADE,
  PRIMARY KEY (cell_key, activity_id)
) STRICT, WITHOUT ROWID;
CREATE INDEX ride_cells_by_activity ON ride_cells (activity_id);
```

`rides_by_start_date` includes `activity_id`, so restoring every track in date order reads the index
instead of sorting about 100 MB of tracks. That cut the server's part of a 2,000-ride restore from
about 1.5 s to about 0.6 s.

**No R\*Tree (changed during implementation).** Because cell keys are latitude-major, an area query is
one key range per grid row, so the cell index covers both location and area searches. Bounding boxes
are kept as plain columns. This avoids depending on the R*Tree module in the minimum supported Node
version, 22.13.

### 3. GPS points: one compact blob per ride, not one row per point

GPS points are stored with their ride, in `rides.track`, in a versioned binary encoding:

- header: format version and point count;
- latitude and longitude as Int32 × 10⁻⁷ degrees (about 1 cm);
- elevation as Float32 (NaN = none);
- time as Float64 milliseconds since 1970 UTC (NaN = none).

That comes to 20 bytes per point, plus an 8-byte header (`src/services/ride-history/trackCodec.ts`).
The point order is kept. A decoded track equals the parsed `GPSPoint[]` apart from coordinates
rounded to 10⁻⁷°, and timestamps written in `toISOString()` form.

**Why not one row per point?** At 2–20 million points, a `ride_points(activity_id, seq, lat, lng,
ele, time)` table with a coordinate index takes roughly 3–5 times as much disk. It also makes
restoring every track at startup (needed for the heat map) millions of row reads instead of about
2,000 blob reads. Coordinate searches are served by `ride_cells` instead (§5).
Points stay tied to their ride ID, and they are deleted with it.

### 4. Import, duplicate check and restore

1. The import worker parses the ZIP as it does today (ADR-0004). It also feeds the same stream
   chunks through an **incremental SHA-256** (a small local module, tested against Node's `crypto`;
   Web Crypto cannot hash incrementally), so the file is read only once.
2. Before anything is stored, the browser asks `GET /api/uploads?hash=…`. If a `complete` or
   `partial` upload has the same hash, the user is told when and under which name that file was
   uploaded, and the file is **not imported again** (RULE-23). A file with a different hash is
   imported even if its rides overlap stored ones (RULE-21).
3. `POST /api/uploads` sends the upload's details and its rides in one binary request (§3 encoding).
   The backend:
   - records the upload as `importing` in its own transaction;
   - in **one transaction**, upserts the rides, links them to the upload and writes their cells
     and bounds;
   - sets the status to `complete`, or to `partial` when Ride activities were skipped.

   If the insert fails, nothing from it is kept and the upload is marked `failed`. An upload left
   `importing` by a crash is marked `failed` when the database is next opened.

4. When the app starts, the browser loads `GET /api/uploads` and `GET /api/rides` (a binary stream of
   every stored ride). The import worker decodes it and builds the `SegmentIndex` (ADR-0006). After an
   upload, the worker rebuilds the index over the whole history.
5. Filters (ADR-0005) are kept when an upload is added. IDs of rides that no longer exist are
   dropped from the exclusion list after a deletion.
6. The duplicate check is the `POST` itself: the backend refuses a known hash with 409 and the
   earlier upload, atomically, so `GET /api/uploads?hash=` is not needed before uploading.
7. Uploads stay possible while the history loads at startup. Every history load has a generation
   number, and only the newest one is applied, so a slow startup load never overwrites the history
   an upload has just read back.

### 5. Location index

`cell_key` uses a **fixed** grid of 0.001° latitude by 0.001° longitude (about 111 m × 70 m at
51°N), so a key's meaning never depends on which rides are loaded:
`cell_key = (floor(lat·1000) + 90 000) · 400 000 + (floor(lng·1000) + 180 000)`.
Each ride stores the distinct cells its track passes through, with gaps filled along the line
between points. A location query for a point P and radius R:

1. looks up the cells overlapping the circle (`ride_cells` primary key);
2. intersects the candidate rides with any date range (`rides_by_start_date`);
3. decodes only the candidates' tracks and checks the exact distance from P to each track segment.

The heat map's 25 m grid (ADR-0006) stays separate. It depends on the loaded rides' reference
latitude and is rebuilt in the browser.

### 6. Deletion

`POST /api/uploads/delete` takes `{ uploadIds }` (one or more) and `DELETE /api/uploads` removes
everything. A selective deletion runs as one transaction:

```sql
BEGIN IMMEDIATE;
-- every ID must exist, or nothing is deleted (404 with the missing IDs)
DELETE FROM uploads WHERE upload_id IN (…);         -- cascades to upload_rides
DELETE FROM rides WHERE NOT EXISTS                  -- only rides no remaining upload contains
  (SELECT 1 FROM upload_rides u WHERE u.activity_id = rides.activity_id);
COMMIT;
```

`ride_cells` follows by cascade. Any error rolls back the whole transaction, so either every
selected upload is removed or none is. After "delete all", the file is compacted with `VACUUM`.

### 7. Analytics (deterministic)

The analytics are pure functions in `src/features/analytics/services`. The backend runs them over
repository queries, and they are exposed as `GET /api/analytics/*`, each with a validated, typed
input and output:

| Function (`GET /api/analytics/…`)         | Input                                     | Output                                                                  |
| ----------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------- |
| `distanceByMonth` (`distance-by-month`)   | date range                                | per month with rides: rides, distance, elevation gain, moving time      |
| `distanceByYear` (`distance-by-year`)     | date range                                | per year: the same                                                      |
| `countLocationVisits` (`location-visits`) | place, radius (default 100 m), date range | distinct rides within the radius, oldest first, with their closest pass |
| `rankRoadFrequency` (`route-frequency`)   | area (≤ 1° a side), limit, date range     | the 0.001° road cells used by the most distinct rides                   |
| `comparePeriods` (`compare-periods`)      | metric, period A, period B (place)        | both values, the difference and the change in percent                   |
| `matchSegment` (phase 6)                  | catalog segment ID                        | rides that rode the segment (RULE-24)                                   |

`GET /api/analytics` lists these functions and their parameters. Date ranges are calendar dates
(`YYYY-MM-DD`, inclusive) in the history's time zone. Location visits use the location index for
candidates, then measure each candidate's track exactly (§5). Totals count only known values
(RULE-13).

Year and month use the machine's local time zone, which is the browser's (ADR-0007), because the
backend runs on the same machine. A future chatbot would call these endpoints or functions and
nothing else. No chatbot is part of this decision.

### 8. Migration and safety

- There is **no existing ride data to migrate**: until now rides were never stored (BRD v2.2 §7).
  The segment catalog, the legacy SQLite file and the BR-30 migration are not touched.
- The schema is versioned with `PRAGMA user_version`, and each migration runs in a transaction, like
  `server/db/database.ts`. Before an existing file is upgraded, a copy is made with
  `VACUUM INTO 'rides.sqlite.v<N>.bak'`. A database whose version is newer than the app is never
  opened for writing, and ride history then reports `storage-unavailable`.
- If ride storage is unavailable, the Uploads section says so and a new ZIP is **not** imported
  (BRD §10 error scenarios). The segment features keep working.

## Alternatives considered

- **One row per GPS point** (`ride_points`): see §3. The owner can ask for it. The `ride_cells`
  design works with either.
- **First upload owns a ride / a copy per upload:** rejected by the owner on 2026-11-19 in favour of
  shared ownership.
- **Storing the ZIP files themselves:** not needed. Parsed tracks are what the app and the analytics
  use, and an export can be many GB.
- **IndexedDB or the JSON catalog for rides:** excluded by the owner. A single JSON file would also
  have to be rewritten in full on every upload.
- **Parsing the ZIP in the backend:** would change the tested worker pipeline (ADR-0004) and upload
  the whole archive. Parsing stays in the worker, and only parsed rides are sent.

## Consequences

- Rides now persist on the user's machine. NFR-07 still holds (local only), and NFR-09 extends to
  rides: "Delete all", or deleting `data/rides.sqlite` while the app is stopped, removes them.
- The heat map now depends on the local backend for stored history. Without it, ride history is
  unavailable (BRD §10 error scenarios).
- Startup now restores and indexes the whole history. NFR-10 sets the budget, and `npm run perf`
  gains a restore benchmark.
- AC-15 and AC-18 change meaning, and the existing tests for "a new ZIP replaces the dataset" are
  rewritten for cumulative uploads.

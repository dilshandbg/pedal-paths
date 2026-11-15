# BRD v2.0: gap analysis and implementation plan

Date: 2026-11-15. Baseline: `dev` at the `docs/readme-status` merge, with BRD v1.1 fully
implemented and verified.

## 1. Gap analysis

### Already implemented (BRD v1.1, unchanged in v2.0)

| Area                                                                                   | Requirements                                      | Where                                                                                  |
| -------------------------------------------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------- |
| ZIP import in a Web Worker, Ride-only, GPX + FIT, graceful skips, progress and summary | BR-01 – BR-05, BR-16, AC-01 – AC-05, AC-15, AC-16 | `features/activities`, `services/strava-export`, `services/gpx`, `services/fit`        |
| Frequency heat map, year/month/ride filters, combined filters, reset, dynamic updates  | BR-06 – BR-12, BR-15, AC-06 – AC-14               | `features/heatmap`, `features/filters`, `components/map`                               |
| Ride details, ride count, total distance and elevation                                 | BR-13, BR-14                                      | `features/filters/utils/describeRide`, `features/activities/utils/summarizeActivities` |
| Performance budget                                                                     | NFR-02                                            | ADR-0006, `npm run perf`                                                               |

### New or changed in v2.0

| Requirement                                                | Current state                                                                                                    | Gap                                                                     |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| BR-17 / AC-17 ZIP type and size validation                 | Content is checked (`not-a-zip`, `corrupt-archive`); no size check or early type check                           | Add an up-front file check before the worker starts                     |
| BR-18 / AC-18 duplicate rides                              | Duplicate CSV rows with the same Activity ID are skipped (`importStravaArchive`); a new ZIP replaces the dataset | No code gap. Add explicit AC-18 tests                                   |
| BR-19 / AC-19 moving time, average distance                | Count, total distance and elevation only; moving time is not parsed                                              | Parse `Moving Time` from `activities.csv`, extend the summary and panel |
| BR-20 – BR-27 segments                                     | Nothing exists                                                                                                   | New backend, database, API, client feature, UI and map overlay          |
| BR-28 / AC-29 no Strava connection                         | True today                                                                                                       | Keep; add a check that the app makes no requests to Strava hosts        |
| NFR-07 – NFR-09 local storage, request validation, removal | No backend                                                                                                       | Covered by ADR-0009                                                     |

### Conflicts found between the documents and the code

| Topic        | BRD v1.1                             | Implementation                          | Resolution in v2.0                                                 |
| ------------ | ------------------------------------ | --------------------------------------- | ------------------------------------------------------------------ |
| Map library  | Leaflet + Leaflet.heat (non-binding) | MapLibre + deck.gl (ADR-0006, ADR-0008) | BRD §8 updated to the implemented stack                            |
| ZIP library  | JSZip                                | fflate (streaming; ADR-0004)            | BRD §8 names fflate as the equivalent                              |
| Backend      | none ("run locally")                 | none                                    | Local Node backend + SQLite for segments (ADR-0009)                |
| Strava OAuth | out of scope                         | none                                    | Still out of scope (owner decision), now explicit for segments too |

## 2. Design summary

- **Backend (ADR-0009):** `server/` contains the SQLite access layer (`node:sqlite`), the segment
  repository and a JSON API handler. A Vite plugin mounts the handler in `npm run dev` and
  `vite preview`.
- **Import (ADR-0010):** the browser parses the file into a normalized payload, the server
  previews it, and after confirmation the server imports it in one transaction.
- **UI:** a Segments tab in the left panel, a blue segment overlay on the map, and selection both
  from the list and on the map.

### Database schema (version 1)

```sql
CREATE TABLE segments (
  segment_id         TEXT PRIMARY KEY,      -- Strava segment ID
  name               TEXT NOT NULL,
  distance_m         REAL,
  elevation_gain_m   REAL,
  average_grade      REAL,
  maximum_grade      REAL,
  elevation_high_m   REAL,
  elevation_low_m    REAL,
  city               TEXT,
  state              TEXT,
  country            TEXT,
  start_lat          REAL,
  start_lng          REAL,
  end_lat            REAL,
  end_lng            REAL,
  route_json         TEXT,                  -- JSON [[lng, lat], ...]
  pr_elapsed_time_s  INTEGER,
  pr_date            TEXT,
  effort_count       INTEGER,
  source_file        TEXT,
  imported_at        TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);
CREATE TABLE segment_efforts (
  segment_id      TEXT NOT NULL REFERENCES segments(segment_id) ON DELETE CASCADE,
  effort_key      TEXT NOT NULL,            -- effort ID, or "<start_date>|<elapsed_time_s>"
  effort_id       TEXT,
  activity_id     TEXT,
  start_date      TEXT NOT NULL,
  elapsed_time_s  INTEGER NOT NULL,
  moving_time_s   INTEGER,
  PRIMARY KEY (segment_id, effort_key)
);
CREATE INDEX segment_efforts_by_segment ON segment_efforts (segment_id, elapsed_time_s);
```

### API (local, same origin)

| Method and path              | Purpose                                                           | Responses          |
| ---------------------------- | ----------------------------------------------------------------- | ------------------ |
| `GET /api/segments`          | All stored segments with route and personal best, without efforts | 200                |
| `GET /api/segments/:id`      | One segment with its efforts                                      | 200, 404           |
| `POST /api/segments/preview` | Validate a normalized payload and classify it; stores nothing     | 200, 400, 413, 415 |
| `POST /api/segments/import`  | Validate and apply a payload in one transaction                   | 200, 400, 413, 415 |
| `DELETE /api/segments/:id`   | Remove one segment and its efforts                                | 204, 404           |
| `DELETE /api/segments`       | Remove all segment data                                           | 204                |

## 3. Tasks

| #   | Phase | Task                                                                                               | Requirements                        |
| --- | ----- | -------------------------------------------------------------------------------------------------- | ----------------------------------- |
| 1   | 1     | BRD v2.0, import format, ADR-0009, ADR-0010, this plan, architecture and design docs, traceability | all                                 |
| 2   | 2     | File type and size check before import (`validateArchiveFile`)                                     | BR-17, AC-17                        |
| 3   | 2     | AC-18 tests for duplicate activity rows and re-import                                              | BR-18, AC-18                        |
| 4   | 3     | Moving time from `activities.csv`; summary and panel with moving time and average distance         | BR-19, AC-19                        |
| 5   | 4     | Segment domain types; pure parse, validate, plan, merge and personal-best services                 | BR-20 – BR-24                       |
| 6   | 4     | `server/`: database and migrations, repository, API handler, Vite plugin                           | BR-23, BR-24, BR-27, NFR-07, NFR-08 |
| 7   | 4     | Client API, segments store, Segments tab: import and review, list, detail, remove                  | BR-20 – BR-27                       |
| 8   | 4     | Map overlay and selection                                                                          | BR-26, AC-27                        |
| 9   | 4     | e2e: segment import → review → list → detail → map → remove; no Strava requests                    | AC-20 – AC-29                       |

Phase 3 of the brief (heat map and filters) is already complete apart from task 4.

## 4. Open decision

- **OD-24 limits.** The BRD requires a size check but gives no number. Provisional values: ZIP ≤
  5 GB and segment file ≤ 20 MB. Each is a single constant, so it is easy to change on the
  owner's confirmation.

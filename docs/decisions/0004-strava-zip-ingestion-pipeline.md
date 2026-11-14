# 0004. Strava export ZIP ingestion pipeline

- Status: Accepted
- Date: 2026-11-14
- Related requirements: BR-01, BR-02, BR-05, BR-16, AC-01, AC-02, AC-05, AC-15, AC-16, DATA-01–05, UX-01–04, NFR-02

## Context

BRD v1.1 makes the **original Strava export ZIP** the only input (RULE-01, RULE-02). A Strava
"Download your data" archive contains:

- `activities.csv`: one row per activity, including `Activity ID`, `Activity Date`,
  `Activity Name`, `Activity Type`, `Distance`, `Elevation Gain` and `Filename`. The CSV has
  duplicate column names and multi-line quoted descriptions.
- `activities/`: one GPS file per activity, named by the `Filename` column. The file is
  `.gpx`, `.fit` or `.tcx`, often gzip-compressed (`.gpx.gz`, `.fit.gz`, `.tcx.gz`).
- Large unrelated content (`media/`, other CSVs). Archives can be several hundred MB to several GB.

## Decision

1. **Upload:** the user picks the `.zip` with a file input (or drag and drop). Loading a new ZIP
   replaces the whole dataset (BR-16). The original archive is never uploaded anywhere.
2. **Pipeline:** each stage is a pure function with its own tests (NFR-05):
   1. `readStravaArchive(file)`: stream-unzip with **fflate**, reading **only** `activities.csv`
      and `activities/*` and skipping `media/` and everything else. Gunzip `.gz` entries.
   2. `parseActivitiesCsv(text)`: an RFC 4180 CSV parser that handles quotes, embedded newlines
      and duplicate headers (columns are resolved by position).
   3. `classifyActivities(rows)`: keep only `Activity Type` = Ride (ADR-0007).
   4. Associate each Ride with its GPS file through `Filename`.
   5. Parse: **GPX** with the native `DOMParser`; **FIT** with **`@garmin/fitsdk`** (Garmin's
      official JavaScript SDK).
   6. `normalizeActivity()` → `CyclingActivity` (ADR-0007).
3. **Runs in a Web Worker** so that unzipping and parsing large archives never freezes the map or
   UI (NFR-02, UX-09). The worker posts progress events (UX-02) and a final `ImportResult`.
4. **Fault-tolerant:** one bad file produces an `ImportIssue` and never aborts the import (DATA-05).
   The UI reports the loaded count and the skipped count (UX-03, UX-04).
5. **Fatal errors** produce a clear message (AC-16) without touching the previously loaded dataset.
   The fatal cases are: not a ZIP, no `activities.csv`, or no Ride with usable GPS.
6. **TCX** files are not in the BRD's supported formats. They are recorded as an
   `unsupported-format` issue and reported, not parsed.
7. **No persistence** across page reloads. The BRD doesn't require it, so the user re-selects the
   ZIP after a reload.

## Libraries

| Need         | Choice              | Why                                                                                                    | Rejected                                                                        |
| ------------ | ------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| ZIP + gunzip | `fflate`            | Small (~8 kB), no dependencies, streaming unzip (multi-GB archives), and gunzip built in               | JSZip (BRD suggestion): no streaming, needs the whole archive in memory, larger |
| FIT          | `@garmin/fitsdk`    | Official SDK from the FIT format owner, maintained, handles developer fields and compressed timestamps | Community parsers: less maintained                                              |
| GPX          | none (`DOMParser`)  | GPX is simple XML                                                                                      | GPX libraries: unnecessary dependency                                           |
| CSV          | none (local parser) | One file with a known shape; about 50 lines, easy to test                                              | PapaParse: unnecessary dependency                                               |

Installed: `fflate` 0.8, `@garmin/fitsdk` 21.218. The lockfile pins exact versions.

## Consequences

- Classification depends on `activities.csv`. An archive without it is a fatal, clearly reported
  error (AC-16).
- We assume `activities.csv` headers are in English. Header lookup is centralized in one module so
  that a localized export can be supported later if needed.
- Memory is bounded to the activity files, not the whole archive.

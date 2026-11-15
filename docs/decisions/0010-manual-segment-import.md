# 0010. Manual segment import

- Status: Accepted (owner requirement, BRD v2.0, 2026-11-15)
- Date: 2026-11-15
- Related requirements: BR-20 – BR-28, AC-20 – AC-29, RULE-14 – RULE-18

## Context

The owner wants segment details imported once, by hand, from files prepared outside the app. Strava
OAuth, Strava API calls, background sync and automatic discovery of segments from rides are all out
of scope (BRD §2). The Strava API does document segment data (segments, segment efforts, PR
statistics). Some of it, such as segment effort history, requires a Strava subscription. That data
can still reach the app in a file.

## Decision

- **Formats:** JSON, GeoJSON and CSV, specified in `docs/segment-import-format.md`.
  - JSON and GeoJSON field names follow the Strava API (`id`, `distance`, `total_elevation_gain`,
    `athlete_segment_stats`, …), so data copied from Strava needs little reshaping. Unknown
    fields are ignored.
  - CSV comes in two kinds, segments or efforts, recognised by the header.
- **Geometry:** GeoJSON `LineString` / `MultiLineString` (preferred), or an encoded polyline. The
  encoding is not named in Strava's reference, so the de-facto encoded polyline algorithm with
  precision 5 is assumed. Decoded coordinates outside the valid lat/lng range are a validation
  error.
- **Pipeline:**
  1. **Browser:** read the file, detect its kind, map it to a normalized `SegmentImportPayload`,
     and validate it (pure functions in `src/features/segments/services`).
  2. **Server, review:** `POST /api/segments/preview` re-validates, then classifies each segment
     as new, update or unchanged, and each effort as new or already stored. Nothing is stored.
  3. **Server, confirm:** `POST /api/segments/import` re-validates and applies the import in one
     SQLite transaction.
- **Identity and updates:**
  - The key is the Strava segment ID.
  - Fields present in a re-import replace the stored values; absent fields keep them.
  - Efforts are only ever added. They are de-duplicated by effort ID, or by start time and
    elapsed time when there is no ID.
- **Personal best:** the fastest stored effort; otherwise the file's stated PR (RULE-17).
- **Map:** segments are drawn by their own deck.gl `PathLayer`s on top of the heat map, in blue with
  a white casing. The selected segment is drawn thicker and darker. The layers are pickable, and
  clicking a route selects it. They never read or change the ride filters (RULE-18).
- **UI:** a Segments tab next to the ride filters. It contains:
  - file import with problem list, review table and confirm/cancel;
  - a list with name search, distance range filter and sort;
  - a detail view with efforts and the PR marked;
  - remove one or remove all, each with an inline confirmation.

## Consequences

- No Strava credentials, rate limits or token handling exist anywhere in the app.
- Segment data is only as current as the last file; the UI shows when each segment was last
  updated.
- Efforts can't be corrected or deleted individually, only by removing the segment and re-importing
  it. That keeps the first version small.

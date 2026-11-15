# 0011. JSON segment catalog replaces SQLite

- Status: Accepted (owner decision, BRD v2.1, 2026-11-15)
- Date: 2026-11-15
- Supersedes: the storage part of [ADR-0009](0009-local-backend-sqlite.md). The local backend, its
  loopback-only API and its validation stay as ADR-0009 describes.
- Related requirements: BR-23, BR-24, BR-27, BR-29, BR-30, RULE-14 – RULE-17, RULE-19, AC-23,
  AC-30, AC-31, NFR-07 – NFR-09

## Context

The owner asked for segments to be kept in a JSON segment catalog instead of the SQLite database,
including complete segment data (route geometry plus altitude and distance samples), loaded when the
app starts, and with segments already stored in SQLite migrated without loss. Rides must stay in
memory only. IndexedDB and unnecessary database changes are explicitly not wanted.

The catalog holds one person's segments: at most thousands of records, read once and rewritten
rarely (only on import or removal).

## Decision

1. **Storage:** a single UTF-8 JSON file, `data/segment-catalog.json` by default (git-ignored),
   configurable with `SEGMENT_CATALOG_PATH`. Format: `docs/segment-catalog-format.md`
   (`"format": "segment-catalog"`, `"version": 1`, one entry per segment ID).
2. **Who writes it:** only the existing local backend (`server/catalog/catalogRepository.ts`),
   behind the same `/api/segments` API and the same `SegmentRepository` interface. The browser,
   the upload UI, the review step and the API are unchanged.
3. **Load and write:** the catalog is read and fully validated once, on the first API request
   (which the app makes when it starts), and kept in memory. Every change is written to a temporary
   file that is then renamed over the catalog, and takes effect in memory only after the write
   succeeded. A file that is not valid JSON or not a valid catalog is never loaded or overwritten;
   the API answers `storage-unavailable` and the server log names the problems.
4. **Same rules:** reads and writes go through the shared pure validation and import plan
   (`validateSegmentPayload`, `planSegmentImport`, `mergeSegment`). The repository behaviour tests
   are a shared contract run against both the catalog and the old SQLite store.
5. **Migration (BR-30):** if the catalog file does not exist and a SQLite database does
   (`SEGMENTS_DB_PATH`, default `data/segments.sqlite`), its segments are copied into the catalog
   with every detail, route, elevation value, effort and import date. The written file is read back
   and compared first; only then is the database renamed to `segments.sqlite.migrated`. A failed
   check removes the new file and leaves the database where it was. Because an emptied catalog file
   stays in place, the migration never runs twice.
6. `node:sqlite` is now used only by the migration. Removing it entirely is a later clean-up,
   once no SQLite databases from v2.0 are left.

## Alternatives considered

- **Keep SQLite and mirror to JSON:** two copies that must stay in sync. Rejected by the owner.
- **JSON in the browser (download/upload, or IndexedDB):** loses automatic persistence (AC-23);
  IndexedDB was explicitly excluded.
- **One file per segment:** easier partial writes, but more files to manage and remove. Not needed
  at this scale.

## Consequences

- The catalog is a plain file that the user can read, back up or edit by hand while the app is
  stopped. Edits made while the app runs are overwritten by its next change.
- Each change rewrites the whole file. That is fine for a personal catalog; it would not suit very
  large or concurrent use.
- Segment data is still only on the user's machine; removing it is "Remove all" in the app, or
  deleting the file with the app stopped (NFR-09).

# 0009. Local Node backend with SQLite for segment data

- Status: Accepted (owner requirement, BRD v2.0, 2026-11-15). Storage superseded by
  [ADR-0011](0011-json-segment-catalog.md) (BRD v2.1): segments are now kept in a JSON catalog;
  SQLite is only read once, to migrate them.
- Date: 2026-11-15
- Amends: [ADR-0002](0002-client-side-gpx-processing.md) (the app is no longer client-only)
- Related requirements: BR-23, BR-24, BR-27, BR-28, NFR-01, NFR-03, NFR-07, NFR-08, NFR-09

## Context

BRD v2.0 requires imported segment data to persist in a local SQLite database (BR-23). Until now the
app ran entirely in the browser (ADR-0002), and a browser can't open a SQLite file. The owner chose
that rides are **not** persisted, so the backend only serves segment data. The app must never call
Strava (BR-28) and must stay local (NFR-07).

## Decision

1. **Runtime:** Node.js, with no web framework. The API is a small connect-style request handler
   using `node:http` types (`server/`).
2. **Database:** Node's built-in `node:sqlite` (`DatabaseSync`), available without a flag since
   Node 22.13. No native addon or extra package is needed. The minimum Node version becomes
   22.13. The database file defaults to `data/segments.sqlite` (git-ignored) and can be moved
   with `SEGMENTS_DB_PATH`. The schema version is tracked with `PRAGMA user_version`; migrations
   run at start-up.
3. **Hosting:** the API is mounted into the Vite dev server and `vite preview` by a Vite plugin
   (`server/vitePlugin.ts`). `npm run dev` and `npm start` therefore run one local process on
   `localhost`, and the app calls the API on the same origin at `/api/segments`. The plugin is
   disabled under Vitest.
4. **Security:**
   - The server listens on localhost only (Vite's default), and the API also refuses any request
     whose peer is not a loopback address, in case the server is started with `--host`.
   - Every request body is validated again on the server with the same pure validator the UI
     uses.
   - JSON bodies are limited in size, and state-changing requests must be `application/json`.
     That forces a CORS preflight, which the API never approves, so other websites cannot change
     local data.
   - A request with an `Origin` from another host is rejected.
   - Errors return a stable code and no internal details.
   - No secrets are involved.
5. **Shared logic:** validation, import planning, merging and personal-best rules are pure
   functions in `src/features/segments/services`. The server imports them by relative path; they
   use value imports only by relative path, so the Vite config bundle can load them.

## Consequences

- `npm run dev`, `npm run preview` (`vite preview`) and the Playwright e2e server all include the API.
  A plain static host serving `dist/` would not, and the Segments section then reports that
  storage is unavailable while the heat map keeps working.
- `node:sqlite` is still marked experimental in Node 22/24, so its API could change; it is wrapped
  by `server/db/` and covered by tests.
- Removing all segment data is an API call (Segments → Remove all), or deleting the database file.

# 0012. Optional Strava segment download command

- Status: Accepted (owner decision, BRD v2.2, 2026-11-15)
- Date: 2026-11-15
- Amends: [ADR-0010](0010-manual-segment-import.md) (segment data is still uploaded by the user,
  but can now be downloaded from Strava by a separate command first)
- Related requirements: BR-28, BR-31, AC-29, AC-32, NFR-03, NFR-07

## Context

The owner's segment file (`strava_segments_catalog.json`) holds only generic names
(`"Segment <id>"`) and empty `route.latlng`, `route.altitude` and `route.distance` arrays. The real
names and road-following routes exist only on Strava: `GET /segments/{id}` (details, name) and
`GET /segments/{id}/streams?keys=latlng,altitude,distance` (route samples). The app must not invent
coordinates or names, and BR-28 keeps the application itself offline from Strava.

## Decision

1. **A separate command, not the app:** `npm run fetch-segments [ids… | --from <file>] [--out <file>]`
   (`server/strava/fetchSegmentsCli.mjs`, logic in `server/strava/fetchSegments.ts`). Without IDs it
   takes them from the segment catalog. The browser app, the local API and the upload workflow do
   not change, and the app still makes no Strava requests (AC-29 stays true).
2. **Output is an ordinary upload file** (`data/strava-segments.json` by default, git-ignored): the
   JSON upload format with Strava field names plus `streams`. The user uploads it in the Segments
   tab, reviews it and confirms; segments are updated by ID, so names, routes, samples and
   statistics replace the generic or missing values (RULE-16).
3. **Token:** the user's own access token, from `STRAVA_ACCESS_TOKEN` in the environment or
   `.env.local` (copied from https://www.strava.com/settings/api; read access, valid for 6 hours). It
   is sent only to `https://www.strava.com/api/v3` in the `Authorization` header, never put in a
   URL, printed, written to a file or committed. No OAuth flow, client secret or refresh token is
   stored, so there are no Strava connection details to keep or revoke in the app.
4. **Failures:** a missing or inaccessible segment is reported and skipped; failed streams keep the
   details; `401` (bad or expired token) and `429` (rate limit) stop the download and keep what was
   fetched. Requests run one after the other with a short pause (two requests per segment), well
   within Strava's default limits for a personal list of segments.
5. **Running TypeScript:** the command loads the module with Vite's `ssrLoadModule` (no config
   file, no app plugins), as the local backend does, so no new dependency is needed.
6. **Tests** use a fake HTTP function with mocked Strava responses; no real account, token or
   network is used.

## Alternatives considered

- **Strava access inside the app (OAuth):** a client secret and refresh tokens to store, and the
  app would contact Strava. Rejected (BR-28).
- **Manual download with curl:** no code, but the user must combine two responses per segment by
  hand. Offered; the owner chose the command.
- **Routes from the user's own rides:** real roads but no names, and it would persist part of a
  ride track. Not chosen.

## Consequences

- Getting real names and routes takes one command and one upload. Re-running it later refreshes the
  segments.
- The command depends on Strava's API terms and availability; the app works without it.

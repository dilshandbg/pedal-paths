# 0002. Client-side GPX processing for the MVP

- Status: Accepted. Confirmed by BRD v1.1 (local use); extended by ADR-0004 (ZIP, FIT, Web Worker).
  Amended by ADR-0009: rides are still processed only in the browser, and a local backend stores
  segment data
- Date: 2026-11-14

## Context

The project brief names GPX files as the first data source and asks for client-side processing
in the MVP. This is a personal application.

## Decision

- There is no backend. GPX files are parsed and normalized in the browser.
- Parsing uses the native `DOMParser`, with no third-party GPX library.
- Parsing and normalization are pure TypeScript modules (`services/gpx`, `features/activities/services`)
  with no React or browser-UI dependencies. If they ever move to a Web Worker or a server, they
  can move unchanged.

## Consequences

- GPS data never leaves the user's machine, which is good for privacy.
- The Google Maps API key ships in the client bundle, so it must be restricted by HTTP referrer.
- Large imports may need a Web Worker and track simplification (OD-11).
- Strava API (OAuth) integration would need a backend or token proxy, and is out of scope here.

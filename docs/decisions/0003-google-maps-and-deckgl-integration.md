# 0003. Google Maps + deck.gl integration

- Status: **Superseded by [ADR-0008](0008-maplibre-osm-base-map.md)** (2026-11-14)
- Date: 2026-11-14

## Context

The stack requires the Google Maps JavaScript API for the base map and deck.gl for route
visualization. deck.gl provides `GoogleMapsOverlay` (`@deck.gl/google-maps`), which renders deck.gl
layers inside a Google map, and can share the WebGL context on vector maps.

## Options for loading and owning the map

1. **`@vis.gl/react-google-maps`** (maintained by vis.gl with Google's support): `<APIProvider>` and
   `<Map>` components, plus a `useMap()` hook for attaching a `GoogleMapsOverlay`. It is idiomatic
   React and handles the script loading lifecycle.
2. **`@googlemaps/js-api-loader`** plus a hand-written `<MapView>` that manages the
   `google.maps.Map` instance in a ref. It has fewer abstractions but more lifecycle code to maintain.

## Recommendation

Option 1. Load the map through `APIProvider` in `app/providers/AppProviders.tsx`, attach a single
`GoogleMapsOverlay` in a `features/heatmap/components` component, and update its `layers` when
`HeatMapData` changes. Use a Map ID (vector map) for interleaved rendering and custom styling.

## Current state of the scaffold

`@deck.gl/core`, `@deck.gl/layers` and `@deck.gl/google-maps` are installed. No map loader library
is installed until this ADR is accepted.

## Consequences

- deck.gl layers receive `HeatMapData` only and never compute it, so heat map logic stays testable.
- E2E tests against a real Google map need a valid key. Without one, tests cover the shell and
  the "key missing" state.

## Update 2026-11-14: BRD v1.1 conflict (OD-22)

BRD v1.1 §8 (non-binding) proposes **Leaflet + OpenStreetMap** and says the app "should run
locally without requiring Google Maps billing". The project brief mandates Google Maps.
Leaflet.heat is a point-density heat map and can't meet BR-12, so routes are drawn with a deck.gl
`PathLayer` whichever base map is chosen. The candidates are:

1. **Google Maps + `GoogleMapsOverlay`** (this ADR). Personal use is usually within the free tier,
   but it needs a Google Cloud billing account and an API key.
2. **MapLibre GL JS + OpenStreetMap-compatible tiles + deck.gl `MapboxOverlay`**. No billing and
   no Google key; tiles come from a free provider (for example OpenFreeMap).

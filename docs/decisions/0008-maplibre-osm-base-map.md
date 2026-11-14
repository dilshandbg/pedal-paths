# 0008. MapLibre GL JS + OpenStreetMap tiles as the base map

- Status: Accepted (decided by the project owner, 2026-11-14)
- Date: 2026-11-14
- Supersedes: [ADR-0003](0003-google-maps-and-deckgl-integration.md)
- Related requirements: BR-06, BR-12, NFR-02, NFR-03, NFR-04
- Resolves: OD-08, OD-22

## Context

The project brief specified Google Maps. BRD v1.1 §8 asks for the app to run locally without Google
Maps billing and proposes OpenStreetMap-based mapping. The heat map must show traversal frequency
(BR-12), which rules out Leaflet.heat. Rendering about 2,000 rides smoothly (NFR-02) favours WebGL.

## Decision

- **Base map:** MapLibre GL JS (`maplibre-gl`), an open-source WebGL vector map with pan and zoom
  built in (BR-06).
- **Tiles:** a free OpenStreetMap-compatible vector style. The default is
  **OpenFreeMap** (`https://tiles.openfreemap.org/styles/liberty`), which needs no API key and has
  no billing. It can be overridden with the optional `VITE_MAP_STYLE_URL`.
- **Routes:** a deck.gl `PathLayer` attached through `MapboxOverlay` from `@deck.gl/mapbox`, which
  supports MapLibre, rendering only the prepared `HeatMapData` (ADR-0006).
- **No React map wrapper.** A small component owns the `maplibregl.Map` instance in a ref, so there
  is no extra dependency.
- Map code is confined to `services/map`, `components/map` and `features/heatmap/components`.

## Dependency changes

| Remove                                       | Add                              |
| -------------------------------------------- | -------------------------------- |
| `@deck.gl/google-maps`, `@types/google.maps` | `maplibre-gl`, `@deck.gl/mapbox` |

## Consequences

- No API key, so no secret at all (NFR-03, NFR-04). `VITE_GOOGLE_MAPS_API_KEY` is removed.
- Map tiles are fetched from the tile provider while browsing. The provider sees which map areas
  are viewed, but no activity data is ever sent. An internet connection is needed for the base map.
- OpenStreetMap / OpenFreeMap attribution must stay visible on the map (MapLibre's attribution
  control is kept).
- E2E tests can render the real map without credentials.

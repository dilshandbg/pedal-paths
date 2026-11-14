# 0006. Heat map traversal-frequency model

- Status: Accepted
- Date: 2026-11-14
- Related requirements: BR-12, AC-09, AC-12, RULE-10, NFR-02, NFR-05
- Resolves: OD-03, OD-11

## Context

Intensity must represent **how often a road or segment is traversed** (BR-12) and be covered by
automated tests (NFR-05). Visual tricks such as additive opacity, and point-density heat maps
(including Leaflet.heat and deck.gl `HeatmapLayer`), measure point density, not traversals. A slow
climb produces more points than a fast descent, so density misrepresents frequency.

## Decision

1. **Snap tracks to a grid and count per segment.** Each track is resampled. Consecutive points
   are snapped to a fixed metric grid, starting at roughly 25 m cells as a tunable constant.
   Every edge between adjacent snapped cells becomes a segment key.
2. **Frequency = the number of distinct activities** that traverse a segment. A ride that loops
   the same road several times counts once for that segment. So the heat map answers "on how many
   rides did I use this road?", and a single lap-heavy ride can't dominate the map.
3. `intensity = frequency / maxFrequency`, in the range 0..1. The colour ramp is a sequential scale
   from low to high. The exact ramp is chosen during implementation and must keep enough contrast
   on the base map.
4. Neighbouring segments with the same frequency are merged into paths, giving `HeatMapPath[]`
   with `activityIds` per path, so AC-09 can be checked directly.
5. All of this is pure code in `features/heatmap/services`, independent of the map. The renderer
   draws only the paths it is given, coloured and sized by `intensity`.
6. **Performance target** (NFR-02): about 2,000 rides at 1 point per second. A filter change should
   update the map in **under 250 ms** on a typical laptop. To get there, the per-activity snapped
   segment sets are built once at import and cached. A filter change only re-aggregates the
   counts.

## Consequences

- GPS noise across parallel lanes is absorbed by the grid size, which may need tuning with real
  data.
- The grid introduces slight geometric smoothing. Accepted, because the intent is frequency, not
  exact geometry.

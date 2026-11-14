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

## Amendment (2026-11-15): as implemented for BR-12

- **Index.** `buildSegmentIndex` (`features/heatmap/services`) runs once per import, in the import
  worker, and is stored in the loaded dataset as `SegmentIndex`. It uses typed arrays only, so it
  structured-clones cheaply:
  - cells and segments get dense integer IDs;
  - each activity stores its **distinct** segments as a sorted `Uint32Array`;
  - cell → segment adjacency is held in compressed sparse row form.
- **Grid.** 25 m cells (`DEFAULT_CELL_SIZE_M`). The column width is scaled by
  1/cos(mean latitude), so cells are square on the ground. Consecutive points are joined with
  8-neighbour steps. Gaps longer than `MAX_GAP_CELLS` (20 cells, ~500 m) are left unjoined, so
  recording pauses don't draw straight lines across the map.
- **Geometry.** A path vertex is the mean of the GPS points that fell in its cell, not the cell
  centre, so drawn roads follow the real track.
- **Intensity is log-scaled**: `log(1 + f) / log(1 + max)`. This replaces item 3's linear ratio,
  which made once-ridden roads nearly invisible next to a daily commute (1/300 → 0.003, versus
  ≈ 0.12 on the log scale). The ramp runs from orange to dark red (`components/map/heatStyle.ts`),
  and line width (2–6 px) also grows with intensity, so colour is not the only signal. A legend
  shows the range from 1 ride to the maximum.
- **No `activityIds` per path** (changes item 4). Storing ride IDs on every merged path cost
  memory with no consumer. AC-09 is verified through frequencies instead: dropping a ride lowers
  the count on every road it used (`aggregateHeatMap.test.ts`). `HeatMapData.activityIds` lists
  the rides that contributed.
- **Draw order.** Paths are bucketed by frequency (O(n), no sort), and the busiest are drawn last.
- **Measured** (Node, synthetic worst case: 2,000 random-walk rides × 3,600 points with almost no
  overlap, giving ~870k paths):

  | Step                       | Time       |
  | -------------------------- | ---------- |
  | Index build (worker, once) | ~3.4 s     |
  | Re-aggregate, 500 rides    | ~50 ms     |
  | Re-aggregate, all rides    | 280–970 ms |

  The 250 ms target in item 6 is **not yet met for the full worst case**. Real exports overlap
  heavily (repeated routes), which cuts the segment and path counts substantially. NFR-02 stays
  open until it is measured with real data and the filter UI exists (BR-09). Options, if needed:
  - move aggregation into a worker;
  - simplify paths by zoom level.

import type { ActivityId } from './activity';

/**
 * A coordinate in `[longitude, latitude]` order — the axis order used by deck.gl and GeoJSON.
 * Note this is the reverse of {@link GPSPoint}'s latitude/longitude naming.
 */
export type LngLat = readonly [longitude: number, latitude: number];

/** A renderable stretch of road and how many distinct rides traversed it (BR-12, ADR-0006). */
export interface HeatMapPath {
  readonly coordinates: readonly LngLat[];
  /** Number of distinct selected activities that traverse every segment of this path (≥ 1). */
  readonly frequency: number;
  /**
   * `frequency` on a 0..1 log scale relative to {@link HeatMapData.maxFrequency}:
   * `log(1 + frequency) / log(1 + maxFrequency)`. It is monotonic, so more rides always means
   * higher intensity (AC-12), but rarely ridden roads stay visible next to daily commutes.
   */
  readonly intensity: number;
}

/**
 * Render-ready heat map data. Pure functions in `src/features/heatmap/services` produce it from
 * the selected activities, and the map layer consumes it. Model: ADR-0006.
 */
export interface HeatMapData {
  readonly paths: readonly HeatMapPath[];
  /** Highest `frequency` in `paths`, or 0 when there are none. */
  readonly maxFrequency: number;
  /** Every activity that contributed to this data set. */
  readonly activityIds: readonly ActivityId[];
}

/**
 * Precomputed road-segment index for a whole dataset (ADR-0006). It is built once, in the import
 * worker, so that re-aggregating after a filter change is only counter increments.
 *
 * Tracks are snapped to a grid of ~`cellSizeM` cells. A "segment" is an edge between two adjacent
 * (8-neighbour) cells. Cells and segments are numbered densely from 0.
 */
export interface SegmentIndex {
  readonly cellSizeM: number;
  /** `[lng, lat]` per cell: the mean of the GPS points that fell in it, or the cell centre. */
  readonly cellLngLat: Float64Array;
  /** `[cellA, cellB]` per segment. */
  readonly segmentCells: Uint32Array;
  /** CSR adjacency: segments touching cell `c` are `cellSegments[cellSegmentOffsets[c] .. [c+1])`. */
  readonly cellSegmentOffsets: Uint32Array;
  readonly cellSegments: Uint32Array;
  /** Distinct segments traversed by each activity, ascending. */
  readonly activitySegments: ReadonlyMap<ActivityId, Uint32Array>;
}

/** Geographic bounding box in WGS84 degrees. */
export interface GeoBounds {
  readonly west: number;
  readonly south: number;
  readonly east: number;
  readonly north: number;
}

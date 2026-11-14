import type { ActivityId } from './activity';

/**
 * A coordinate in `[longitude, latitude]` order — the axis order used by deck.gl and GeoJSON.
 * Note this is the reverse of {@link GPSPoint}'s latitude/longitude naming.
 */
export type LngLat = readonly [longitude: number, latitude: number];

/**
 * Static drawing geometry of a dataset's road segments (ADR-0006). It depends only on the
 * {@link SegmentIndex}, so it is built once per loaded export and reused for every filter change.
 */
export interface HeatMapGeometry {
  readonly segmentCount: number;
  readonly cellCount: number;
  /** `[lng, lat]` of each segment's first end cell. */
  readonly segmentSources: Float64Array;
  /** `[lng, lat]` of each segment's second end cell. */
  readonly segmentTargets: Float64Array;
  /** `[lng, lat]` per cell: where segments meet (joints and crossings). */
  readonly cellPositions: Float64Array;
}

/**
 * Render-ready heat map data for the current selection (BR-12, ADR-0006). Pure functions in
 * `src/features/heatmap/services` produce it; the map layer only turns it into colours and widths.
 * Everything is indexed by segment or cell number, so a filter change never rebuilds geometry.
 */
export interface HeatMapData {
  readonly geometry: HeatMapGeometry;
  /** Distinct selected activities that traverse each segment (0 = not drawn). */
  readonly segmentFrequency: Uint32Array;
  /**
   * Highest frequency among the segments meeting at each cell, so joints and crossings take the
   * busiest road's colour (0 = not drawn).
   */
  readonly cellFrequency: Uint32Array;
  /** Highest segment frequency, or 0 when nothing is drawn. */
  readonly maxFrequency: number;
  /**
   * Intensity 0..1 for each frequency 0..maxFrequency: `log(1 + f) / log(1 + maxFrequency)`. It is
   * monotonic, so more rides always means higher intensity (AC-12), but rarely ridden roads stay
   * visible next to daily commutes.
   */
  readonly intensityByFrequency: Float32Array;
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

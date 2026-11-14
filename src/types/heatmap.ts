import type { ActivityId } from './activity';

/**
 * A coordinate in `[longitude, latitude]` order — the axis order used by deck.gl and GeoJSON.
 * Note this is the reverse of {@link GPSPoint}'s latitude/longitude naming.
 */
export type LngLat = readonly [longitude: number, latitude: number];

/** A renderable path together with how many distinct rides traversed it (ADR-0006). */
export interface HeatMapPath {
  readonly coordinates: readonly LngLat[];
  /** Number of distinct filtered activities that traverse this path (≥ 1) (BR-12). */
  readonly frequency: number;
  /** `frequency` normalized to 0..1 against {@link HeatMapData.maxFrequency}. */
  readonly intensity: number;
  /** Activities that contribute to this path (makes AC-09 verifiable). */
  readonly activityIds: readonly ActivityId[];
}

/**
 * Render-ready heat map data. Pure functions in `src/features/heatmap/services` produce it from
 * the filtered activities, and the map layer consumes it. Model: ADR-0006.
 */
export interface HeatMapData {
  readonly paths: readonly HeatMapPath[];
  /** Highest `frequency` in `paths`, or 0 when there are none. */
  readonly maxFrequency: number;
  /** Every activity represented in this data set. */
  readonly activityIds: readonly ActivityId[];
}

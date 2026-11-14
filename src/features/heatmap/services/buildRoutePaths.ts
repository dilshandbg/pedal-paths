import { DEFAULT_MIN_POINT_SPACING_M, decimateTrack } from '@/features/heatmap/utils/decimateTrack';
import type { CyclingActivity, HeatMapData, HeatMapPath, LngLat } from '@/types';

export interface BuildRoutePathsOptions {
  /** Minimum spacing between rendered points, in metres. */
  readonly minPointSpacingM?: number;
}

/**
 * Turns activities into render-ready map data, with **one path per ride** (BR-06).
 *
 * Every path has frequency 1 for now. Traversal-frequency intensity (BR-12, ADR-0006) will replace
 * this with grid-snapped segment counts, behind the same `HeatMapData` shape, so the map renderer
 * doesn't change.
 */
// Implements: BR-06
export function buildRoutePaths(
  activities: readonly CyclingActivity[],
  { minPointSpacingM = DEFAULT_MIN_POINT_SPACING_M }: BuildRoutePathsOptions = {},
): HeatMapData {
  const paths: HeatMapPath[] = [];

  for (const activity of activities) {
    const coordinates = decimateTrack(activity.gpsTrack, minPointSpacingM).map(
      ({ latitude, longitude }): LngLat => [longitude, latitude],
    );
    if (coordinates.length >= 2) {
      paths.push({
        coordinates,
        frequency: 1,
        intensity: 1,
        activityIds: [activity.activityId],
      });
    }
  }

  return {
    paths,
    maxFrequency: paths.length > 0 ? 1 : 0,
    activityIds: paths.flatMap((path) => path.activityIds),
  };
}

import type { HeatMapGeometry, SegmentIndex } from '@/types';

/**
 * Drawing geometry of every road segment in the index (ADR-0006): the positions of each segment's
 * two end cells, and of every cell. It doesn't depend on the filter, so it is built once per
 * loaded export and shared by every filter change (NFR-02).
 */
export function buildHeatMapGeometry(index: SegmentIndex): HeatMapGeometry {
  const segmentCount = index.segmentCells.length / 2;
  const segmentSources = new Float64Array(segmentCount * 2);
  const segmentTargets = new Float64Array(segmentCount * 2);
  for (let s = 0; s < segmentCount; s += 1) {
    const a = index.segmentCells[s * 2] ?? 0;
    const b = index.segmentCells[s * 2 + 1] ?? 0;
    segmentSources[s * 2] = index.cellLngLat[a * 2] ?? 0;
    segmentSources[s * 2 + 1] = index.cellLngLat[a * 2 + 1] ?? 0;
    segmentTargets[s * 2] = index.cellLngLat[b * 2] ?? 0;
    segmentTargets[s * 2 + 1] = index.cellLngLat[b * 2 + 1] ?? 0;
  }
  return {
    segmentCount,
    cellCount: index.cellLngLat.length / 2,
    segmentSources,
    segmentTargets,
    cellPositions: index.cellLngLat,
  };
}

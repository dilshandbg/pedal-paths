import type { ActivityId, HeatMapData, HeatMapGeometry, SegmentIndex } from '@/types';

/** `log(1 + f) / log(1 + max)`: 0..1, monotonic in f, keeps rarely ridden roads visible. */
export function frequencyToIntensity(frequency: number, maxFrequency: number): number {
  if (maxFrequency <= 0 || frequency <= 0) {
    return 0;
  }
  return Math.log1p(frequency) / Math.log1p(maxFrequency);
}

/**
 * Counts, for the given activities, how many **distinct** rides traverse each road segment, and
 * returns render-ready data (BR-12, AC-12, RULE-10).
 *
 * Runs on every filter change, so it only touches typed arrays: one counter increment per
 * (ride, segment), then one pass over the segments. The drawing geometry is shared, never rebuilt
 * (NFR-02, ADR-0006).
 */
// Implements: BR-12, AC-12, RULE-10, NFR-02
export function aggregateHeatMap(
  index: SegmentIndex,
  geometry: HeatMapGeometry,
  activityIds: readonly ActivityId[],
): HeatMapData {
  const segmentFrequency = new Uint32Array(geometry.segmentCount);
  const included: ActivityId[] = [];

  for (const id of activityIds) {
    const segments = index.activitySegments.get(id);
    if (!segments) {
      continue;
    }
    included.push(id);
    for (const segment of segments) {
      segmentFrequency[segment] = (segmentFrequency[segment] ?? 0) + 1;
    }
  }

  // Joints and crossings take the frequency of the busiest segment meeting there.
  const cellFrequency = new Uint32Array(geometry.cellCount);
  let maxFrequency = 0;
  for (let s = 0; s < geometry.segmentCount; s += 1) {
    const frequency = segmentFrequency[s] ?? 0;
    if (frequency === 0) {
      continue;
    }
    if (frequency > maxFrequency) maxFrequency = frequency;
    const a = index.segmentCells[s * 2] ?? 0;
    const b = index.segmentCells[s * 2 + 1] ?? 0;
    if (frequency > (cellFrequency[a] ?? 0)) cellFrequency[a] = frequency;
    if (frequency > (cellFrequency[b] ?? 0)) cellFrequency[b] = frequency;
  }

  const intensityByFrequency = new Float32Array(maxFrequency + 1);
  for (let f = 1; f <= maxFrequency; f += 1) {
    intensityByFrequency[f] = frequencyToIntensity(f, maxFrequency);
  }

  return {
    geometry,
    segmentFrequency,
    cellFrequency,
    maxFrequency,
    intensityByFrequency,
    activityIds: included,
  };
}

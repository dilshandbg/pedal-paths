import type { ActivityId, HeatMapData, HeatMapPath, LngLat, SegmentIndex } from '@/types';

/** `log(1 + f) / log(1 + max)`: 0..1, monotonic in f, keeps rarely ridden roads visible. */
export function frequencyToIntensity(frequency: number, maxFrequency: number): number {
  if (maxFrequency <= 0 || frequency <= 0) {
    return 0;
  }
  return Math.log1p(frequency) / Math.log1p(maxFrequency);
}

/**
 * Counts, for the given activities, how many **distinct** rides traverse each road segment, and
 * returns render-ready paths (BR-12, AC-12, RULE-10).
 *
 * Runs on every selection change (filters), so it only touches typed arrays. Consecutive segments
 * with the same count that meet at a simple (degree-2) junction are merged into one path, which
 * keeps the number of drawn paths low and joins smooth.
 */
// Implements: BR-12, AC-12, RULE-10
export function aggregateHeatMap(
  index: SegmentIndex,
  activityIds: readonly ActivityId[],
): HeatMapData {
  const segmentCount = index.segmentCells.length / 2;
  const cellCount = index.cellSegmentOffsets.length - 1;
  const counts = new Uint32Array(segmentCount);
  const included: ActivityId[] = [];

  for (const id of activityIds) {
    const segments = index.activitySegments.get(id);
    if (!segments) {
      continue;
    }
    included.push(id);
    for (const segment of segments) {
      counts[segment] = (counts[segment] ?? 0) + 1;
    }
  }

  let maxFrequency = 0;
  const degree = new Uint8Array(cellCount);
  for (let s = 0; s < segmentCount; s += 1) {
    const count = counts[s] ?? 0;
    if (count > 0) {
      if (count > maxFrequency) maxFrequency = count;
      const a = index.segmentCells[s * 2] ?? 0;
      const b = index.segmentCells[s * 2 + 1] ?? 0;
      degree[a] = (degree[a] ?? 0) + 1;
      degree[b] = (degree[b] ?? 0) + 1;
    }
  }

  const visited = new Uint8Array(segmentCount);
  const otherEnd = (segment: number, cell: number) => {
    const a = index.segmentCells[segment * 2] ?? 0;
    return a === cell ? (index.segmentCells[segment * 2 + 1] ?? 0) : a;
  };

  /** From `cell`, arriving via `via`, follow unvisited same-count segments through degree-2 cells. */
  const extend = (startCell: number, via: number, frequency: number): number[] => {
    const chain: number[] = [];
    let cell = startCell;
    let previous = via;
    while (degree[cell] === 2) {
      let next = -1;
      const end = index.cellSegmentOffsets[cell + 1] ?? 0;
      for (let k = index.cellSegmentOffsets[cell] ?? 0; k < end; k += 1) {
        const segment = index.cellSegments[k] ?? 0;
        if (segment !== previous && counts[segment] === frequency && visited[segment] === 0) {
          next = segment;
          break;
        }
      }
      if (next < 0) {
        break;
      }
      visited[next] = 1;
      cell = otherEnd(next, cell);
      chain.push(cell);
      previous = next;
    }
    return chain;
  };

  // A cell is usually shared by neighbouring paths: create its coordinate tuple once.
  const cellCoordinates: (LngLat | undefined)[] = new Array<LngLat | undefined>(cellCount);
  const lngLat = (cell: number): LngLat =>
    (cellCoordinates[cell] ??= [
      index.cellLngLat[cell * 2] ?? 0,
      index.cellLngLat[cell * 2 + 1] ?? 0,
    ]);

  const intensityOf = Array.from({ length: maxFrequency + 1 }, (_, f) =>
    frequencyToIntensity(f, maxFrequency),
  );
  // Bucket by frequency (small integers) instead of sorting: draw order is quietest first, busiest
  // last, so busy roads sit on top where paths touch. O(n), and no comparator calls.
  const buckets: HeatMapPath[][] = Array.from({ length: maxFrequency + 1 }, () => []);

  for (let s = 0; s < segmentCount; s += 1) {
    const frequency = counts[s] ?? 0;
    if (frequency === 0 || visited[s] === 1) {
      continue;
    }
    visited[s] = 1;
    const a = index.segmentCells[s * 2] ?? 0;
    const b = index.segmentCells[s * 2 + 1] ?? 0;
    const backward = extend(a, s, frequency);
    const forward = extend(b, s, frequency);

    const coordinates: LngLat[] = [];
    for (let k = backward.length - 1; k >= 0; k -= 1) {
      coordinates.push(lngLat(backward[k] ?? 0));
    }
    coordinates.push(lngLat(a), lngLat(b));
    for (const cell of forward) {
      coordinates.push(lngLat(cell));
    }

    buckets[frequency]?.push({ coordinates, frequency, intensity: intensityOf[frequency] ?? 0 });
  }

  return { paths: buckets.flat(), maxFrequency, activityIds: included };
}

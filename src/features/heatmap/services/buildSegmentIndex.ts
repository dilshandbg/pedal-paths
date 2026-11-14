import {
  DEFAULT_CELL_SIZE_M,
  cellCentre,
  cellColumn,
  cellFromKey,
  cellKey,
  cellRow,
  createGrid,
  stepCells,
  type Grid,
} from '@/features/heatmap/utils/grid';
import type { CyclingActivity, SegmentIndex } from '@/types';

/** Mean latitude of all track points, used to make grid cells square on the ground. */
function referenceLatitude(activities: readonly CyclingActivity[]): number {
  let sum = 0;
  let count = 0;
  for (const activity of activities) {
    for (const point of activity.gpsTrack) {
      sum += point.latitude;
      count += 1;
    }
  }
  return count === 0 ? 0 : sum / count;
}

/** Undirected edge key between two 8-neighbour cells: lower cell key × 4 + direction. */
function edgeKey(i0: number, j0: number, i1: number, j1: number): number {
  let di = i1 - i0;
  let dj = j1 - j0;
  let i = i0;
  let j = j0;
  // Canonical direction is one of E (0,1), NE (1,1), N (1,0), NW (1,-1).
  if (di < 0 || (di === 0 && dj < 0)) {
    i = i1;
    j = j1;
    di = -di;
    dj = -dj;
  }
  const direction = di === 0 ? 0 : dj === 1 ? 1 : dj === 0 ? 2 : 3;
  return cellKey(i, j) * 4 + direction;
}

class CellTable {
  readonly index = new Map<number, number>();
  readonly sumLng: number[] = [];
  readonly sumLat: number[] = [];
  readonly hits: number[] = [];
  readonly keys: number[] = [];

  idOf(key: number): number {
    let id = this.index.get(key);
    if (id === undefined) {
      id = this.keys.length;
      this.index.set(key, id);
      this.keys.push(key);
      this.sumLng.push(0);
      this.sumLat.push(0);
      this.hits.push(0);
    }
    return id;
  }

  addPoint(id: number, longitude: number, latitude: number): void {
    this.sumLng[id] = (this.sumLng[id] ?? 0) + longitude;
    this.sumLat[id] = (this.sumLat[id] ?? 0) + latitude;
    this.hits[id] = (this.hits[id] ?? 0) + 1;
  }
}

/**
 * Builds the road-segment index for a dataset (BR-12, ADR-0006). Runs once per import, in the
 * import worker.
 *
 * Each track is snapped to the grid. Consecutive cells are joined by 8-neighbour steps, and gaps
 * longer than `MAX_GAP_CELLS` are left unjoined. Each activity records the **distinct** segments
 * it traverses, so a loop ridden several times in one activity counts once.
 */
// Implements: BR-12, RULE-10
export function buildSegmentIndex(
  activities: readonly CyclingActivity[],
  cellSizeM: number = DEFAULT_CELL_SIZE_M,
): SegmentIndex {
  const grid: Grid = createGrid(referenceLatitude(activities), cellSizeM);
  const cells = new CellTable();
  const segmentIdByKey = new Map<number, number>();
  const segmentEnds: number[] = [];
  const activitySegments = new Map<string, Uint32Array>();

  const segmentId = (i0: number, j0: number, i1: number, j1: number): number => {
    const key = edgeKey(i0, j0, i1, j1);
    let id = segmentIdByKey.get(key);
    if (id === undefined) {
      id = segmentEnds.length / 2;
      segmentIdByKey.set(key, id);
      segmentEnds.push(cells.idOf(cellKey(i0, j0)), cells.idOf(cellKey(i1, j1)));
    }
    return id;
  };

  for (const activity of activities) {
    const traversed = new Set<number>();
    let previous: [number, number] | null = null;

    for (const { latitude, longitude } of activity.gpsTrack) {
      const i = cellRow(grid, latitude);
      const j = cellColumn(grid, longitude);
      cells.addPoint(cells.idOf(cellKey(i, j)), longitude, latitude);

      if (previous && (previous[0] !== i || previous[1] !== j)) {
        const path = stepCells(previous[0], previous[1], i, j);
        if (path) {
          let [pi, pj] = previous;
          for (const [ci, cj] of path) {
            traversed.add(segmentId(pi, pj, ci, cj));
            pi = ci;
            pj = cj;
          }
        }
      }
      previous = [i, j];
    }

    if (traversed.size > 0) {
      activitySegments.set(activity.activityId, Uint32Array.from(traversed).sort());
    }
  }

  return {
    cellSizeM,
    cellLngLat: cellCoordinates(grid, cells),
    segmentCells: Uint32Array.from(segmentEnds),
    ...cellAdjacency(cells.keys.length, segmentEnds),
    activitySegments,
  };
}

/** Mean position of the GPS points in each cell (smooth geometry), or the cell centre if none. */
function cellCoordinates(grid: Grid, cells: CellTable): Float64Array {
  const coordinates = new Float64Array(cells.keys.length * 2);
  cells.keys.forEach((key, id) => {
    const hits = cells.hits[id] ?? 0;
    if (hits > 0) {
      coordinates[id * 2] = (cells.sumLng[id] ?? 0) / hits;
      coordinates[id * 2 + 1] = (cells.sumLat[id] ?? 0) / hits;
    } else {
      const [i, j] = cellFromKey(key);
      const [lng, lat] = cellCentre(grid, i, j);
      coordinates[id * 2] = lng;
      coordinates[id * 2 + 1] = lat;
    }
  });
  return coordinates;
}

/** Compressed sparse row adjacency: which segments touch each cell. */
function cellAdjacency(
  cellCount: number,
  segmentEnds: readonly number[],
): { cellSegmentOffsets: Uint32Array; cellSegments: Uint32Array } {
  const offsets = new Uint32Array(cellCount + 1);
  for (const cell of segmentEnds) {
    offsets[cell + 1] = (offsets[cell + 1] ?? 0) + 1;
  }
  for (let c = 0; c < cellCount; c += 1) {
    offsets[c + 1] = (offsets[c + 1] ?? 0) + (offsets[c] ?? 0);
  }
  const cursor = offsets.slice(0, cellCount);
  const segments = new Uint32Array(segmentEnds.length);
  for (let k = 0; k < segmentEnds.length; k += 1) {
    const cell = segmentEnds[k] ?? 0;
    const position = cursor[cell] ?? 0;
    segments[position] = Math.floor(k / 2);
    cursor[cell] = position + 1;
  }
  return { cellSegmentOffsets: offsets, cellSegments: segments };
}

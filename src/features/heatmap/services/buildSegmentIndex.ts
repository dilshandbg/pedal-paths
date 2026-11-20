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
import type { ActivityId, SegmentIndex } from '@/types';
import type { LatLngLike } from '@/utils/geo';

/** What the index reads of a ride: its ID and its track's positions, in order. */
export interface IndexableRide {
  readonly activityId: ActivityId;
  readonly gpsTrack: readonly LatLngLike[];
}

/** Mean latitude of all track points, used to make grid cells square on the ground. */
function referenceLatitude(activities: readonly IndexableRide[]): number {
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

/**
 * Undirected edge key between two 8-neighbour cells: the canonical end's cell id × 4 + direction.
 * Cell ids are small dense integers, so the key stays a small integer and map lookups stay fast
 * for millions of points (NFR-10).
 */
function edgeKey(i0: number, j0: number, i1: number, j1: number, id0: number, id1: number) {
  let di = i1 - i0;
  let dj = j1 - j0;
  let start = id0;
  // Canonical direction is one of E (0,1), NE (1,1), N (1,0), NW (1,-1).
  if (di < 0 || (di === 0 && dj < 0)) {
    start = id1;
    di = -di;
    dj = -dj;
  }
  const direction = di === 0 ? 0 : dj === 1 ? 1 : dj === 0 ? 2 : 3;
  return start * 4 + direction;
}

class CellTable {
  /** Cell id by row, then column: both small integers, unlike the packed cell key. */
  readonly rows = new Map<number, Map<number, number>>();
  readonly sumLng: number[] = [];
  readonly sumLat: number[] = [];
  readonly hits: number[] = [];
  readonly keys: number[] = [];

  idOf(i: number, j: number): number {
    let row = this.rows.get(i);
    if (row === undefined) {
      row = new Map();
      this.rows.set(i, row);
    }
    let id = row.get(j);
    if (id === undefined) {
      id = this.keys.length;
      row.set(j, id);
      this.keys.push(cellKey(i, j));
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
  activities: readonly IndexableRide[],
  cellSizeM: number = DEFAULT_CELL_SIZE_M,
): SegmentIndex {
  const grid: Grid = createGrid(referenceLatitude(activities), cellSizeM);
  const cells = new CellTable();
  // Segment id by edge key (canonical cell id × 4 + direction), −1 when not stored yet. Edge keys
  // are dense small integers, so a flat array replaces a map: millions of lookups (NFR-10).
  let segmentIdByKey = new Int32Array(1 << 16).fill(-1);
  const segmentEnds: number[] = [];
  const activitySegments = new Map<string, Uint32Array>();

  /** Segment between two neighbouring cells whose ids are known; stored on first use. */
  const segmentId = (
    i0: number,
    j0: number,
    i1: number,
    j1: number,
    id0: number,
    id1: number,
  ): number => {
    const key = edgeKey(i0, j0, i1, j1, id0, id1);
    if (key >= segmentIdByKey.length) {
      const grown = new Int32Array(Math.max(key + 1, segmentIdByKey.length * 2)).fill(-1);
      grown.set(segmentIdByKey);
      segmentIdByKey = grown;
    }
    let id = segmentIdByKey[key] ?? -1;
    if (id < 0) {
      id = segmentEnds.length / 2;
      segmentIdByKey[key] = id;
      segmentEnds.push(id0, id1);
    }
    return id;
  };

  for (const activity of activities) {
    const traversed = new Set<number>();
    // The previous point's cell. Consecutive points usually share a cell (25 m cells, a few
    // metres apart), so its id is reused instead of looked up again: this loop runs once per GPS
    // point, millions of times for a large history (NFR-10).
    let hasPrevious = false;
    let pi = 0;
    let pj = 0;
    let previousCellId = 0;

    for (const { latitude, longitude } of activity.gpsTrack) {
      const i = cellRow(grid, latitude);
      const j = cellColumn(grid, longitude);
      const sameCell = hasPrevious && i === pi && j === pj;
      const cellId = sameCell ? previousCellId : cells.idOf(i, j);
      cells.addPoint(cellId, longitude, latitude);

      if (hasPrevious && !sameCell) {
        if (Math.abs(i - pi) <= 1 && Math.abs(j - pj) <= 1) {
          // A neighbour: one step, as stepCells gives, with both ids already known.
          traversed.add(segmentId(pi, pj, i, j, previousCellId, cellId));
        } else {
          const path = stepCells(pi, pj, i, j);
          if (path) {
            let si = pi;
            let sj = pj;
            let sid = previousCellId;
            for (const [ci, cj] of path) {
              // Ids in path order, as they were given when the segment was first stored.
              const cid = cells.idOf(ci, cj);
              traversed.add(segmentId(si, sj, ci, cj, sid, cid));
              si = ci;
              sj = cj;
              sid = cid;
            }
          }
        }
      }
      hasPrevious = true;
      pi = i;
      pj = j;
      previousCellId = cellId;
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

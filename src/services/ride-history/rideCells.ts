import type { GeoBounds, GPSPoint } from '@/types';
import { haversineDistanceKm } from '../../utils/geo';

/*
 * Location index of the ride history (ADR-0013 §5). Every ride records the cells of a FIXED
 * 0.001° × 0.001° grid that its track passes through, so a cell key means the same place whichever
 * rides are stored. Keys are latitude-major: one grid row is one contiguous key range, so an area
 * is a few `BETWEEN` ranges.
 *
 * Only relative and type-only imports: the local backend loads this file without the `@/` alias.
 */

/** Cells per degree of latitude and of longitude (0.001° ≈ 111 m north–south). */
export const CELLS_PER_DEGREE = 1000;
/** Key stride of one grid row; larger than the 360 001 columns. */
const ROW_STRIDE = 400_000;
/**
 * Consecutive points further apart than this are a recording gap (tunnel, signal loss, paused
 * device) and are not joined, so a gap never claims the places along a straight line.
 */
export const MAX_LINK_M = 500;

const rowOf = (latitude: number) => Math.floor(latitude * CELLS_PER_DEGREE);
const columnOf = (longitude: number) => Math.floor(longitude * CELLS_PER_DEGREE);
const keyOf = (row: number, column: number) =>
  (row + 90 * CELLS_PER_DEGREE) * ROW_STRIDE + (column + 180 * CELLS_PER_DEGREE);

/** Key of the grid cell containing a coordinate. */
export function cellKey(latitude: number, longitude: number): number {
  return keyOf(rowOf(latitude), columnOf(longitude));
}

/** Whether two consecutive track points are joined by a line (not a gap or an antimeridian jump). */
export function isLinked(from: GPSPoint, to: GPSPoint): boolean {
  return (
    Math.abs(to.longitude - from.longitude) < 180 &&
    haversineDistanceKm(from, to) * 1000 <= MAX_LINK_M
  );
}

/**
 * Distinct cells a track passes through, ascending. Linked points add every cell their straight
 * line crosses (grid traversal, so no cell along the line is skipped); a lone point adds its cell.
 */
export function cellsForTrack(points: readonly GPSPoint[]): number[] {
  const cells = new Set<number>();
  points.forEach((point, i) => {
    cells.add(cellKey(point.latitude, point.longitude));
    const previous = i > 0 ? points[i - 1] : undefined;
    if (previous && isLinked(previous, point)) {
      addLineCells(previous, point, cells);
    }
  });
  return [...cells].sort((a, b) => a - b);
}

/** Bounding box of a non-empty track. */
export function trackBounds(points: readonly GPSPoint[]): GeoBounds {
  if (points.length === 0) {
    throw new RangeError('A track needs at least one point.');
  }
  let south = Infinity;
  let north = -Infinity;
  let west = Infinity;
  let east = -Infinity;
  for (const { latitude, longitude } of points) {
    south = Math.min(south, latitude);
    north = Math.max(north, latitude);
    west = Math.min(west, longitude);
    east = Math.max(east, longitude);
  }
  return { west, south, east, north };
}

/** Amanatides–Woo traversal of the cells between two points, in grid units. */
function addLineCells(from: GPSPoint, to: GPSPoint, cells: Set<number>): void {
  const x0 = from.longitude * CELLS_PER_DEGREE;
  const y0 = from.latitude * CELLS_PER_DEGREE;
  const x1 = to.longitude * CELLS_PER_DEGREE;
  const y1 = to.latitude * CELLS_PER_DEGREE;
  let column = Math.floor(x0);
  let row = Math.floor(y0);
  const endColumn = Math.floor(x1);
  const endRow = Math.floor(y1);
  const dx = x1 - x0;
  const dy = y1 - y0;
  const stepX = Math.sign(dx);
  const stepY = Math.sign(dy);
  const tDeltaX = dx === 0 ? Infinity : Math.abs(1 / dx);
  const tDeltaY = dy === 0 ? Infinity : Math.abs(1 / dy);
  let tMaxX = dx > 0 ? (column + 1 - x0) / dx : dx < 0 ? (x0 - column) / -dx : Infinity;
  let tMaxY = dy > 0 ? (row + 1 - y0) / dy : dy < 0 ? (y0 - row) / -dy : Infinity;

  // One step per crossed grid line; the bound guarantees termination despite rounding.
  let steps = Math.abs(endColumn - column) + Math.abs(endRow - row);
  while ((column !== endColumn || row !== endRow) && steps > 0) {
    if (tMaxX < tMaxY) {
      column += stepX;
      tMaxX += tDeltaX;
    } else {
      row += stepY;
      tMaxY += tDeltaY;
    }
    cells.add(keyOf(row, column));
    steps -= 1;
  }
}

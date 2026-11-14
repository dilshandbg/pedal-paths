/**
 * Grid geometry for the traversal-frequency heat map (ADR-0006).
 *
 * Cells are `latStep` × `lonStep` degrees. `lonStep` is widened by 1 / cos(reference latitude) so
 * cells are roughly square on the ground where the rides are. A cell is identified by integer
 * indices (i = latitude row, j = longitude column), packed into one safe integer key.
 */

/** Default cell size: absorbs typical GPS scatter across lanes and repeat rides. */
export const DEFAULT_CELL_SIZE_M = 25;

/** Metres per degree of latitude (mean Earth radius). */
export const METRES_PER_DEGREE_LAT = 111_195;

/**
 * Two consecutive points further apart than this many cells are not joined: it's a GPS gap,
 * a pause with auto-pause on, or a teleport (e.g. a train ride), not road actually ridden.
 */
export const MAX_GAP_CELLS = 20;

const OFFSET_I = 2 ** 19; // |i| ≤ 90° / latStep  < 2^19 for cells ≥ 25 m
const OFFSET_J = 2 ** 20; // |j| ≤ 180° / lonStep < 2^20 for cells ≥ 25 m
const J_RANGE = 2 ** 21;

export interface Grid {
  readonly cellSizeM: number;
  readonly latStep: number;
  readonly lonStep: number;
}

export function createGrid(referenceLatitude: number, cellSizeM = DEFAULT_CELL_SIZE_M): Grid {
  const latStep = cellSizeM / METRES_PER_DEGREE_LAT;
  const cosLat = Math.cos((Math.max(-85, Math.min(85, referenceLatitude)) * Math.PI) / 180);
  return { cellSizeM, latStep, lonStep: latStep / cosLat };
}

export const cellRow = (grid: Grid, latitude: number) => Math.floor(latitude / grid.latStep);
export const cellColumn = (grid: Grid, longitude: number) => Math.floor(longitude / grid.lonStep);

/** Packs (i, j) into a non-negative safe integer (< 2^40). */
export const cellKey = (i: number, j: number): number => (i + OFFSET_I) * J_RANGE + (j + OFFSET_J);

export function cellFromKey(key: number): [i: number, j: number] {
  const j = (key % J_RANGE) - OFFSET_J;
  const i = Math.floor(key / J_RANGE) - OFFSET_I;
  return [i, j];
}

/** Centre of cell (i, j) as `[lng, lat]`. */
export const cellCentre = (grid: Grid, i: number, j: number): [number, number] => [
  (j + 0.5) * grid.lonStep,
  (i + 0.5) * grid.latStep,
];

/**
 * Cells visited when moving from (i0, j0) to (i1, j1), excluding the start, so that every step is
 * to an 8-neighbour. Returns null when the jump is longer than `MAX_GAP_CELLS`.
 */
export function stepCells(
  i0: number,
  j0: number,
  i1: number,
  j1: number,
): [number, number][] | null {
  const di = i1 - i0;
  const dj = j1 - j0;
  const steps = Math.max(Math.abs(di), Math.abs(dj));
  if (steps > MAX_GAP_CELLS) {
    return null;
  }
  const cells: [number, number][] = [];
  for (let k = 1; k <= steps; k += 1) {
    cells.push([i0 + Math.round((di * k) / steps), j0 + Math.round((dj * k) / steps)]);
  }
  return cells;
}

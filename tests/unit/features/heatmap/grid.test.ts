import { describe, expect, it } from 'vitest';
import {
  MAX_GAP_CELLS,
  METRES_PER_DEGREE_LAT,
  cellCentre,
  cellColumn,
  cellFromKey,
  cellKey,
  cellRow,
  createGrid,
  stepCells,
} from '@/features/heatmap/utils/grid';

describe('createGrid', () => {
  it('makes cells roughly square on the ground at the reference latitude', () => {
    const grid = createGrid(60, 25);
    expect(grid.latStep * METRES_PER_DEGREE_LAT).toBeCloseTo(25, 6);
    // At 60° a degree of longitude is half as long, so the step in degrees doubles.
    expect(grid.lonStep).toBeCloseTo(grid.latStep * 2, 9);
  });

  it('stays finite near the poles', () => {
    expect(Number.isFinite(createGrid(90).lonStep)).toBe(true);
  });
});

describe('cell keys', () => {
  it.each([
    [0, 0],
    [-1, -1],
    [400_000, 799_999],
    [-400_000, -800_000],
    [12_345, -67_890],
  ])('round-trips (%s, %s)', (i, j) => {
    const key = cellKey(i, j);
    expect(Number.isSafeInteger(key * 4 + 3)).toBe(true);
    expect(cellFromKey(key)).toEqual([i, j]);
  });

  it('gives distinct cells distinct keys', () => {
    expect(cellKey(1, 0)).not.toBe(cellKey(0, 1));
  });
});

describe('cell lookup', () => {
  it('maps coordinates to the containing cell and back to its centre', () => {
    const grid = createGrid(0, 25);
    const i = cellRow(grid, 0.0001);
    const j = cellColumn(grid, -0.0001);
    expect([i, j]).toEqual([0, -1]);
    const [lng, lat] = cellCentre(grid, i, j);
    expect(lat).toBeCloseTo(grid.latStep / 2, 12);
    expect(lng).toBeCloseTo(-grid.lonStep / 2, 12);
  });
});

describe('stepCells', () => {
  it('walks 8-neighbour steps between distant cells', () => {
    const cells = stepCells(0, 0, 3, 1);
    expect(cells).toEqual([
      [1, 0],
      [2, 1],
      [3, 1],
    ]);
  });

  it('returns no steps for the same cell', () => {
    expect(stepCells(5, 5, 5, 5)).toEqual([]);
  });

  it('refuses to bridge gaps longer than MAX_GAP_CELLS', () => {
    expect(stepCells(0, 0, MAX_GAP_CELLS, 0)).toHaveLength(MAX_GAP_CELLS);
    expect(stepCells(0, 0, MAX_GAP_CELLS + 1, 0)).toBeNull();
  });
});

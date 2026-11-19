// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  cellKey,
  cellsForTrack,
  isLinked,
  MAX_LINK_M,
  trackBounds,
} from '@/services/ride-history/rideCells';
import type { GPSPoint } from '@/types';

const at = (latitude: number, longitude: number): GPSPoint => ({
  latitude,
  longitude,
  elevation: null,
  timestamp: null,
});

describe('BR-38 / ADR-0013 §5: ride location cells', () => {
  it('gives every point in a 0.001° cell the same key, and neighbours different keys', () => {
    expect(cellKey(51.50001, -0.12001)).toBe(cellKey(51.50099, -0.12099));
    expect(cellKey(51.5005, -0.1205)).not.toBe(cellKey(51.5015, -0.1205)); // next row
    expect(cellKey(51.5005, -0.1205)).not.toBe(cellKey(51.5005, -0.1195)); // next column
  });

  it('keeps rows contiguous: keys grow with longitude within a row', () => {
    expect(cellKey(10.0005, 20.0015) - cellKey(10.0005, 20.0005)).toBe(1);
  });

  it('gives unique keys at the poles and the antimeridian', () => {
    const keys = [at(90, 180), at(-90, -180), at(-90, 180), at(90, -180)].map((p) =>
      cellKey(p.latitude, p.longitude),
    );

    expect(new Set(keys).size).toBe(4);
    expect(keys.every(Number.isSafeInteger)).toBe(true);
  });

  it('a single point covers its own cell', () => {
    expect(cellsForTrack([at(1.0005, 2.0005)])).toEqual([cellKey(1.0005, 2.0005)]);
    expect(cellsForTrack([])).toEqual([]);
  });

  it('includes every cell a straight line crosses', () => {
    // 0.0035° (≈ 390 m, within MAX_LINK_M) east along one row: 4 cells.
    const cells = cellsForTrack([at(1.0005, 2.0001), at(1.0005, 2.0036)]);

    expect(cells).toEqual([0, 1, 2, 3].map((i) => cellKey(1.0005, 2.0005 + i * 0.001)));
  });

  it('includes the cells of a diagonal without skipping a corner', () => {
    const cells = cellsForTrack([at(1.0001, 2.0001), at(1.0029, 2.0029)]);

    for (let i = 0; i < 3; i += 1) {
      expect(cells).toContain(cellKey(1.0005 + i * 0.001, 2.0005 + i * 0.001));
    }
    // Each step to the next diagonal cell passes through one side neighbour.
    expect(cells.length).toBeGreaterThanOrEqual(5);
    expect(cells).toEqual([...cells].sort((a, b) => a - b));
  });

  it('does not join a recording gap longer than MAX_LINK_M', () => {
    const farNorth = 1 + (MAX_LINK_M + 100) / 111_195; // just over the limit, in degrees
    const cells = cellsForTrack([at(1.0005, 2.0005), at(farNorth, 2.0005)]);

    expect(isLinked(at(1.0005, 2.0005), at(farNorth, 2.0005))).toBe(false);
    expect(cells).toEqual([cellKey(1.0005, 2.0005), cellKey(farNorth, 2.0005)]);
  });

  it('does not draw a line around the world across the antimeridian', () => {
    const cells = cellsForTrack([at(0.0005, 179.9999), at(0.0005, -179.9999)]);

    expect(cells).toHaveLength(2);
  });

  it('computes the bounding box and rejects an empty track', () => {
    expect(trackBounds([at(1, 5), at(-2, 7), at(3, -4)])).toEqual({
      west: -4,
      south: -2,
      east: 7,
      north: 3,
    });
    expect(() => trackBounds([])).toThrow(RangeError);
  });
});

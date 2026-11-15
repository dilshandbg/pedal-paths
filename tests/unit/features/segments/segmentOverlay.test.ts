import { describe, expect, it } from 'vitest';
import { buildSegmentOverlay, segmentBounds } from '@/features/segments/utils/segmentOverlay';
import { segmentRecord } from './fixtures';

const a = segmentRecord({ segmentId: '1', name: 'A' });
const b = segmentRecord({
  segmentId: '2',
  name: 'B',
  route: null,
  start: { latitude: 1, longitude: 2 },
  end: { latitude: 3, longitude: 4 },
});
const noGeometry = segmentRecord({ segmentId: '3', route: null, start: null, end: null });

describe('BR-26 / AC-27: buildSegmentOverlay', () => {
  it('converts routes to [lng, lat] paths', () => {
    const overlay = buildSegmentOverlay([a], null);
    expect(overlay).toEqual({
      paths: [
        {
          segmentId: '1',
          name: 'A',
          path: [
            [20, 10],
            [20.004, 10.005],
            [20.01, 10.01],
          ],
        },
      ],
      markers: [],
      selectedSegmentId: null,
    });
  });

  it('never draws a straight line without a route: start and end become markers', () => {
    const overlay = buildSegmentOverlay([a, b, noGeometry], null);
    expect(overlay.paths.map((p) => p.segmentId)).toEqual(['1']);
    expect(overlay.markers).toEqual([
      { segmentId: '2', name: 'B', kind: 'start', position: [2, 1] },
      { segmentId: '2', name: 'B', kind: 'end', position: [4, 3] },
    ]);
  });

  it('draws the full route when there is one, even with start and end known', () => {
    const overlay = buildSegmentOverlay([a], null);
    expect(overlay.paths[0]?.path).toHaveLength(3);
    expect(overlay.markers).toEqual([]);
  });

  it('puts the markers of a selected segment without a route last', () => {
    const c = segmentRecord({ segmentId: '4', name: 'C', route: null, end: null });
    const overlay = buildSegmentOverlay([b, c], '2');
    expect(overlay.markers.map((m) => [m.segmentId, m.kind])).toEqual([
      ['4', 'start'],
      ['2', 'start'],
      ['2', 'end'],
    ]);
    expect(overlay.selectedSegmentId).toBe('2');
  });

  it('puts the selected segment last so it is drawn on top', () => {
    const a2 = segmentRecord({ segmentId: '5', name: 'A2' });
    const overlay = buildSegmentOverlay([a, a2], '1');
    expect(overlay.paths.map((p) => p.segmentId)).toEqual(['5', '1']);
    expect(overlay.selectedSegmentId).toBe('1');
  });

  it('clears a selection that is not drawn', () => {
    expect(buildSegmentOverlay([a, noGeometry], '3').selectedSegmentId).toBeNull();
    expect(buildSegmentOverlay([a], '99').selectedSegmentId).toBeNull();
  });
});

describe('segmentBounds', () => {
  it('spans the route', () => {
    expect(segmentBounds(a)).toEqual({ west: 20, south: 10, east: 20.01, north: 10.01 });
  });

  it('falls back to start and end, or null without geometry', () => {
    expect(segmentBounds(b)).toEqual({ west: 2, south: 1, east: 4, north: 3 });
    expect(segmentBounds(noGeometry)).toBeNull();
  });
});

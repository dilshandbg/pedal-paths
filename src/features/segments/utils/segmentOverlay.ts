import type {
  Coordinate,
  GeoBounds,
  LngLat,
  SegmentOverlayData,
  SegmentPath,
  SegmentRecord,
} from '@/types';

const toLngLat = (point: Coordinate): LngLat => [point.longitude, point.latitude];

/** The line to draw for a segment: its route, or start to end when it has no route. */
function segmentLine(segment: SegmentRecord): readonly Coordinate[] | null {
  if (segment.route && segment.route.length >= 2) return segment.route;
  if (segment.start && segment.end) return [segment.start, segment.end];
  return null;
}

/**
 * Render-ready overlay of stored segment routes (BR-26, AC-27). It depends only on the stored
 * segments and the selection, never on the heat map filters (RULE-18). Segments without any
 * geometry are not drawn. The selected segment comes last so it is drawn on top.
 */
// Implements: BR-26, RULE-18
export function buildSegmentOverlay(
  segments: readonly SegmentRecord[],
  selectedSegmentId: string | null,
): SegmentOverlayData {
  const paths: SegmentPath[] = [];
  let selected: SegmentPath | null = null;
  for (const segment of segments) {
    const line = segmentLine(segment);
    if (!line) continue;
    const entry = { segmentId: segment.segmentId, name: segment.name, path: line.map(toLngLat) };
    if (segment.segmentId === selectedSegmentId) selected = entry;
    else paths.push(entry);
  }
  if (selected) paths.push(selected);
  return { paths, selectedSegmentId: selected ? selectedSegmentId : null };
}

/** Bounding box of a segment's drawn line, or null when it has no geometry. */
export function segmentBounds(segment: SegmentRecord): GeoBounds | null {
  const line = segmentLine(segment);
  if (!line) return null;
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const { latitude, longitude } of line) {
    west = Math.min(west, longitude);
    east = Math.max(east, longitude);
    south = Math.min(south, latitude);
    north = Math.max(north, latitude);
  }
  return { west, south, east, north };
}

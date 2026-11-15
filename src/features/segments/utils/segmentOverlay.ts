import type {
  Coordinate,
  GeoBounds,
  LngLat,
  SegmentMarker,
  SegmentOverlayData,
  SegmentPath,
  SegmentRecord,
} from '@/types';

const toLngLat = (point: Coordinate): LngLat => [point.longitude, point.latitude];

/** The segment's route geometry, when it has one. */
const routeOf = (segment: SegmentRecord): readonly Coordinate[] | null =>
  segment.route && segment.route.length >= 2 ? segment.route : null;

/** The points that locate a segment on the map: its route, or else its start and end. */
function segmentPoints(segment: SegmentRecord): readonly Coordinate[] | null {
  const route = routeOf(segment);
  if (route) return route;
  const points = [segment.start, segment.end].filter((p): p is Coordinate => p !== null);
  return points.length > 0 ? points : null;
}

/**
 * Render-ready overlay of stored segments (BR-26, AC-27). A segment with route geometry is drawn
 * as its full route. A segment without one is shown only as start and end markers: it is never
 * joined by a straight line, which would not follow the road. It depends only on the stored
 * segments and the selection, never on the heat map filters (RULE-18). Segments without any
 * geometry are not drawn. The selected segment comes last so it is drawn on top.
 */
// Implements: BR-26, AC-33, RULE-18
export function buildSegmentOverlay(
  segments: readonly SegmentRecord[],
  selectedSegmentId: string | null,
): SegmentOverlayData {
  const paths: SegmentPath[] = [];
  const markers: SegmentMarker[] = [];
  let selectedPath: SegmentPath | null = null;
  let selectedMarkers: SegmentMarker[] = [];
  for (const segment of segments) {
    const { segmentId, name } = segment;
    const isSelected = segmentId === selectedSegmentId;
    const route = routeOf(segment);
    if (route) {
      const entry = { segmentId, name, path: route.map(toLngLat) };
      if (isSelected) selectedPath = entry;
      else paths.push(entry);
      continue;
    }
    const ends: SegmentMarker[] = [];
    if (segment.start) {
      ends.push({ segmentId, name, kind: 'start', position: toLngLat(segment.start) });
    }
    if (segment.end) ends.push({ segmentId, name, kind: 'end', position: toLngLat(segment.end) });
    if (isSelected) selectedMarkers = ends;
    else markers.push(...ends);
  }
  if (selectedPath) paths.push(selectedPath);
  markers.push(...selectedMarkers);
  const drawn = selectedPath !== null || selectedMarkers.length > 0;
  return { paths, markers, selectedSegmentId: drawn ? selectedSegmentId : null };
}

/** Bounding box of a segment's route (or start and end), or null when it has no geometry. */
export function segmentBounds(segment: SegmentRecord): GeoBounds | null {
  const line = segmentPoints(segment);
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

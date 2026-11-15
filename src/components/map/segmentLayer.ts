import type { Layer, PickingInfo } from '@deck.gl/core';
import { PathLayer, ScatterplotLayer } from '@deck.gl/layers';
import type { SegmentMarker, SegmentOverlayData, SegmentPath } from '@/types';

export const SEGMENT_OVERLAY_LAYER_ID = 'segment-overlay';
export const SEGMENT_CASING_LAYER_ID = `${SEGMENT_OVERLAY_LAYER_ID}-casing`;
export const SEGMENT_MARKER_LAYER_ID = `${SEGMENT_OVERLAY_LAYER_ID}-markers`;
const MARKER_RADIUS_PX = 5;
const SELECTED_MARKER_RADIUS_PX = 8;

/** Blue routes with a white casing: distinct from the orange-red heat map in hue and outline. */
const SEGMENT_COLOR: [number, number, number, number] = [37, 99, 235, 235]; // blue-600
const SELECTED_COLOR: [number, number, number, number] = [30, 58, 138, 255]; // blue-900
const CASING_COLOR: [number, number, number, number] = [255, 255, 255, 230];
const WIDTH_PX = 4;
const SELECTED_WIDTH_PX = 7;
const CASING_EXTRA_PX = 3;

const pathOf = (d: SegmentPath) => d.path as unknown as [number, number][];

/**
 * deck.gl layers that draw prepared segment routes above the heat map (BR-26, AC-27), and start
 * and end markers for segments without a route (a filled dot for the start, a ring for the end;
 * never a line between them). They only render; `onSelect` reports a click on a route or marker.
 * The selected segment is wider or larger and darker, so the selection is not shown by colour alone.
 */
export function createSegmentLayers(
  overlay: SegmentOverlayData,
  onSelect: (segmentId: string) => void,
): Layer[] {
  const width = (d: SegmentPath) =>
    d.segmentId === overlay.selectedSegmentId ? SELECTED_WIDTH_PX : WIDTH_PX;
  const triggers = { getWidth: overlay.selectedSegmentId, getColor: overlay.selectedSegmentId };

  return [
    new PathLayer<SegmentPath>({
      id: SEGMENT_CASING_LAYER_ID,
      data: overlay.paths,
      getPath: pathOf,
      getColor: CASING_COLOR,
      getWidth: (d) => width(d) + CASING_EXTRA_PX,
      widthUnits: 'pixels',
      capRounded: true,
      jointRounded: true,
      updateTriggers: triggers,
      pickable: false,
    }),
    new PathLayer<SegmentPath>({
      id: SEGMENT_OVERLAY_LAYER_ID,
      data: overlay.paths,
      getPath: pathOf,
      getColor: (d) => (d.segmentId === overlay.selectedSegmentId ? SELECTED_COLOR : SEGMENT_COLOR),
      getWidth: width,
      widthUnits: 'pixels',
      capRounded: true,
      jointRounded: true,
      updateTriggers: triggers,
      pickable: true,
      onClick: (info: PickingInfo<SegmentPath>) => {
        if (info.object) onSelect(info.object.segmentId);
        return true;
      },
    }),
    new ScatterplotLayer<SegmentMarker>({
      id: SEGMENT_MARKER_LAYER_ID,
      data: overlay.markers,
      getPosition: (d) => d.position as unknown as [number, number],
      getRadius: (d) =>
        d.segmentId === overlay.selectedSegmentId ? SELECTED_MARKER_RADIUS_PX : MARKER_RADIUS_PX,
      radiusUnits: 'pixels',
      stroked: true,
      filled: true,
      lineWidthUnits: 'pixels',
      getLineWidth: 2,
      getFillColor: (d) =>
        d.kind === 'end'
          ? CASING_COLOR
          : d.segmentId === overlay.selectedSegmentId
            ? SELECTED_COLOR
            : SEGMENT_COLOR,
      getLineColor: (d) =>
        d.segmentId === overlay.selectedSegmentId ? SELECTED_COLOR : SEGMENT_COLOR,
      updateTriggers: {
        getRadius: overlay.selectedSegmentId,
        getFillColor: overlay.selectedSegmentId,
        getLineColor: overlay.selectedSegmentId,
      },
      pickable: true,
      onClick: (info: PickingInfo<SegmentMarker>) => {
        if (info.object) onSelect(info.object.segmentId);
        return true;
      },
    }),
  ];
}

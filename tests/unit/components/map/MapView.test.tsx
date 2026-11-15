import { LineLayer, PathLayer, ScatterplotLayer } from '@deck.gl/layers';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  FIT_BOUNDS_MAX_ZOOM,
  FIT_BOUNDS_PADDING_PX,
  INITIAL_VIEW,
} from '@/components/map/mapConfig';
import { MapView } from '@/components/map/MapView';
import { heatColor, heatWidth } from '@/components/map/heatStyle';
import { JOINT_LAYER_ID, SEGMENT_LAYER_ID } from '@/components/map/routeLayer';
import { SEGMENT_CASING_LAYER_ID, SEGMENT_OVERLAY_LAYER_ID } from '@/components/map/segmentLayer';
import { frequencyToIntensity } from '@/features/heatmap/services/aggregateHeatMap';
import type { GeoBounds, HeatMapData, HeatMapGeometry, SegmentOverlayData } from '@/types';
import {
  FakeMap,
  FakeMapboxOverlay,
  FakeNavigationControl,
  workerUrls,
} from '../../../mocks/mapLibraries';

const STYLE = 'https://tiles.example.org/style.json';

// Two separate roads: segment 0 (cells 0-1) ridden once, segment 1 (cells 2-3) five times, and
// segment 2 (cells 1-2) not ridden by the selection.
const geometry: HeatMapGeometry = {
  segmentCount: 3,
  cellCount: 4,
  segmentSources: Float64Array.of(0, 0, 1, 1, 0.01, 0.01),
  segmentTargets: Float64Array.of(0.01, 0.01, 1.01, 1.01, 1, 1),
  cellPositions: Float64Array.of(0, 0, 0.01, 0.01, 1, 1, 1.01, 1.01),
};
const twoRides: HeatMapData = {
  geometry,
  segmentFrequency: Uint32Array.of(1, 5, 0),
  cellFrequency: Uint32Array.of(1, 1, 5, 5),
  maxFrequency: 5,
  intensityByFrequency: Float32Array.from({ length: 6 }, (_, f) => frequencyToIntensity(f, 5)),
  activityIds: ['a', 'b'],
};

interface BinaryAttribute {
  value: ArrayLike<number>;
  size: number;
}
/** The binary attributes handed to one of the deck.gl layers. */
const attributes = (layer: unknown) =>
  (layer as { props: { data: { length: number; attributes: Record<string, BinaryAttribute> } } })
    .props.data;
const rgba = (attribute: BinaryAttribute | undefined, k: number) =>
  Array.from(attribute?.value ?? []).slice(k * 4, k * 4 + 4);

const bounds: GeoBounds = { west: 0, south: 0, east: 1.01, north: 1.01 };

const onlyMap = () => {
  expect(FakeMap.instances).toHaveLength(1);
  return FakeMap.instances[0] as FakeMap;
};
const onlyOverlay = () => {
  expect(FakeMapboxOverlay.instances).toHaveLength(1);
  return FakeMapboxOverlay.instances[0] as FakeMapboxOverlay;
};

describe('BR-06: MapView', () => {
  it('creates an interactive MapLibre map with the configured style and zoom controls', () => {
    render(<MapView styleUrl={STYLE} data={null} fitBounds={null} />);

    const map = onlyMap();
    expect(map.options).toMatchObject({
      style: STYLE,
      center: INITIAL_VIEW.center,
      zoom: INITIAL_VIEW.zoom,
    });
    expect(map.options.container).toBeInstanceOf(HTMLElement);
    // Pan and zoom stay enabled: interaction is never switched off.
    expect(map.options).not.toHaveProperty('interactive', false);
    expect(map.controls.some((control) => control instanceof FakeNavigationControl)).toBe(true);
    expect(map.controls).toContain(onlyOverlay());
  });

  it('points MapLibre at its bundled worker script', () => {
    render(<MapView styleUrl={STYLE} data={null} fitBounds={null} />);

    expect(workerUrls).toHaveLength(1);
    expect(workerUrls[0]).toMatch(/maplibre-gl-worker.*\.mjs/);
  });

  it('asks for a ZIP and draws nothing before rides are loaded', () => {
    render(<MapView styleUrl={STYLE} data={null} fitBounds={null} />);

    expect(screen.getByRole('region', { name: 'Ride map' })).toHaveTextContent(
      'Load your Strava export ZIP',
    );
    expect(onlyOverlay().props.layers).toEqual([]);
    expect(screen.getByRole('status')).toHaveTextContent('No rides loaded');
  });

  it('draws road segments as instanced lines and joints as dots', () => {
    render(<MapView styleUrl={STYLE} data={twoRides} fitBounds={null} />);

    const [segments, joints] = onlyOverlay().props.layers ?? [];
    expect(segments).toBeInstanceOf(LineLayer);
    expect((segments as LineLayer).id).toBe(SEGMENT_LAYER_ID);
    expect(attributes(segments).length).toBe(3);
    expect(joints).toBeInstanceOf(ScatterplotLayer);
    expect((joints as ScatterplotLayer).id).toBe(JOINT_LAYER_ID);
    expect(attributes(joints).length).toBe(4);
    expect(screen.getByRole('status')).toHaveTextContent('Showing 2 rides on the map');
    expect(screen.queryByText(/Load your Strava export ZIP/)).not.toBeInTheDocument();
  });

  it('BR-12: colours and sizes each segment by its intensity', () => {
    render(<MapView styleUrl={STYLE} data={twoRides} fitBounds={null} />);

    const { attributes: segment } = attributes(onlyOverlay().props.layers?.[0]);
    const widths = Array.from(segment.getWidth?.value ?? []);

    expect(rgba(segment.getColor, 1)).toEqual(heatColor(1));
    expect(rgba(segment.getColor, 0)).toEqual(heatColor(frequencyToIntensity(1, 5)));
    expect(widths[1]).toBeCloseTo(heatWidth(1), 5);
    expect(widths[0]).toBeCloseTo(heatWidth(frequencyToIntensity(1, 5)), 5);
    expect(widths[1]).toBeGreaterThan(widths[0] ?? Infinity);
  });

  it('does not draw segments or joints the selection does not use', () => {
    render(<MapView styleUrl={STYLE} data={twoRides} fitBounds={null} />);

    const { attributes: segment } = attributes(onlyOverlay().props.layers?.[0]);
    expect(rgba(segment.getColor, 2)[3]).toBe(0);
    expect(Array.from(segment.getWidth?.value ?? [])[2]).toBe(0);
  });

  it("BR-12: gives joints the busiest meeting road's colour, at half its width", () => {
    render(<MapView styleUrl={STYLE} data={twoRides} fitBounds={null} />);

    const { attributes: joint } = attributes(onlyOverlay().props.layers?.[1]);
    expect(rgba(joint.getFillColor, 3)).toEqual(heatColor(1));
    expect(Array.from(joint.getRadius?.value ?? [])[3]).toBeCloseTo(heatWidth(1) / 2, 5);
  });

  it('NFR-02: reuses the dataset geometry buffers when the selection changes', () => {
    const { rerender } = render(<MapView styleUrl={STYLE} data={twoRides} fitBounds={null} />);
    const fewer: HeatMapData = {
      ...twoRides,
      segmentFrequency: Uint32Array.of(1, 0, 0),
      cellFrequency: Uint32Array.of(1, 1, 0, 0),
      maxFrequency: 1,
      intensityByFrequency: Float32Array.of(0, 1),
      activityIds: ['a'],
    };

    rerender(<MapView styleUrl={STYLE} data={fewer} fitBounds={null} />);

    const { attributes: segment } = attributes(onlyOverlay().props.layers?.[0]);
    const { attributes: joint } = attributes(onlyOverlay().props.layers?.[1]);
    expect(segment.getSourcePosition?.value).toBe(geometry.segmentSources);
    expect(segment.getTargetPosition?.value).toBe(geometry.segmentTargets);
    expect(joint.getPosition?.value).toBe(geometry.cellPositions);
    expect(rgba(segment.getColor, 1)[3]).toBe(0); // no longer drawn
  });

  it('BR-12: shows a legend from 1 ride to the busiest road', () => {
    render(<MapView styleUrl={STYLE} data={twoRides} fitBounds={null} />);

    const legend = screen.getByRole('figure', { name: 'Heat map legend' });
    expect(legend).toHaveTextContent('Rides on a road');
    expect(legend).toHaveTextContent('1 ride');
    expect(legend).toHaveTextContent('5 rides');
  });

  it('shows no legend before rides are loaded', () => {
    render(<MapView styleUrl={STYLE} data={null} fitBounds={null} />);
    expect(screen.queryByRole('figure', { name: 'Heat map legend' })).not.toBeInTheDocument();
  });

  it('removes the routes when data is cleared', () => {
    const { rerender } = render(<MapView styleUrl={STYLE} data={twoRides} fitBounds={null} />);

    rerender(<MapView styleUrl={STYLE} data={null} fitBounds={null} />);

    expect(onlyOverlay().props.layers).toEqual([]);
  });

  it('fits the view to new bounds, and only when they change', () => {
    const { rerender } = render(<MapView styleUrl={STYLE} data={null} fitBounds={null} />);
    const map = onlyMap();
    expect(map.fitBoundsCalls).toHaveLength(0);

    rerender(<MapView styleUrl={STYLE} data={twoRides} fitBounds={bounds} />);
    rerender(<MapView styleUrl={STYLE} data={twoRides} fitBounds={bounds} />);

    expect(map.fitBoundsCalls).toEqual([
      [
        [
          [0, 0],
          [1.01, 1.01],
        ],
        expect.objectContaining({ padding: FIT_BOUNDS_PADDING_PX, maxZoom: FIT_BOUNDS_MAX_ZOOM }),
      ],
    ]);

    rerender(
      <MapView styleUrl={STYLE} data={twoRides} fitBounds={{ ...bounds, east: 2, north: 2 }} />,
    );
    expect(map.fitBoundsCalls).toHaveLength(2);
  });

  it('releases the map when unmounted', () => {
    const { unmount } = render(<MapView styleUrl={STYLE} data={twoRides} fitBounds={null} />);
    const map = onlyMap();

    unmount();

    expect(map.removed).toBe(true);
    expect(onlyOverlay().removed).toBe(true);
  });

  it('explains when the map cannot start (e.g. no WebGL)', () => {
    FakeMap.nextError = new Error('Failed to initialize WebGL');

    render(<MapView styleUrl={STYLE} data={null} fitBounds={null} />);

    expect(screen.getByRole('alert')).toHaveTextContent('The map could not be started');
  });
});

describe('BR-26 / AC-27: MapView segment overlay', () => {
  const overlay: SegmentOverlayData = {
    paths: [
      {
        segmentId: '1',
        name: 'A',
        path: [
          [0, 0],
          [0.01, 0.01],
        ],
      },
      {
        segmentId: '2',
        name: 'B',
        path: [
          [1, 1],
          [1.01, 1.01],
        ],
      },
    ],
    selectedSegmentId: '2',
  };
  type Layer = { id: string; props: Record<string, unknown> };
  const layers = () => (onlyOverlay().props.layers ?? []) as Layer[];
  const layer = (id: string) => layers().find((entry) => entry.id === id);
  const accessor = (id: string, prop: string) =>
    layer(id)?.props[prop] as (d: SegmentOverlayData['paths'][number]) => unknown;

  it('draws segment routes as cased paths above the heat map', () => {
    render(<MapView styleUrl={STYLE} data={twoRides} fitBounds={null} segmentOverlay={overlay} />);
    expect(layers().map((entry) => entry.id)).toEqual([
      SEGMENT_LAYER_ID,
      JOINT_LAYER_ID,
      SEGMENT_CASING_LAYER_ID,
      SEGMENT_OVERLAY_LAYER_ID,
    ]);
    expect(layer(SEGMENT_OVERLAY_LAYER_ID)).toBeInstanceOf(PathLayer);
    expect(layer(SEGMENT_OVERLAY_LAYER_ID)?.props.data).toBe(overlay.paths);
  });

  it('draws the selected segment wider and darker, so it does not rely on colour alone', () => {
    render(<MapView styleUrl={STYLE} data={null} fitBounds={null} segmentOverlay={overlay} />);
    const [plain, selected] = overlay.paths as [
      SegmentOverlayData['paths'][number],
      SegmentOverlayData['paths'][number],
    ];
    const width = accessor(SEGMENT_OVERLAY_LAYER_ID, 'getWidth');
    const color = accessor(SEGMENT_OVERLAY_LAYER_ID, 'getColor');
    expect(width(selected)).toBeGreaterThan(width(plain) as number);
    expect(color(selected)).not.toEqual(color(plain));
    expect(accessor(SEGMENT_CASING_LAYER_ID, 'getWidth')(plain)).toBeGreaterThan(
      width(plain) as number,
    );
  });

  it('draws segments without any rides loaded, and nothing when there are none', () => {
    const { rerender } = render(
      <MapView styleUrl={STYLE} data={null} fitBounds={null} segmentOverlay={overlay} />,
    );
    expect(layers().map((entry) => entry.id)).toEqual([
      SEGMENT_CASING_LAYER_ID,
      SEGMENT_OVERLAY_LAYER_ID,
    ]);
    rerender(<MapView styleUrl={STYLE} data={null} fitBounds={null} segmentOverlay={null} />);
    expect(layers()).toEqual([]);
  });

  it('reports a click on a segment route', () => {
    const selections: string[] = [];
    render(
      <MapView
        styleUrl={STYLE}
        data={null}
        fitBounds={null}
        segmentOverlay={overlay}
        onSegmentSelect={(id) => selections.push(id)}
      />,
    );
    const onClick = layer(SEGMENT_OVERLAY_LAYER_ID)?.props.onClick as (info: {
      object?: unknown;
    }) => void;
    expect(layer(SEGMENT_OVERLAY_LAYER_ID)?.props.pickable).toBe(true);
    onClick({ object: overlay.paths[0] });
    onClick({}); // a click next to every route selects nothing
    expect(selections).toEqual(['1']);
  });

  it('does not rebuild the layers when only the click handler changes', () => {
    const { rerender } = render(
      <MapView styleUrl={STYLE} data={twoRides} fitBounds={null} segmentOverlay={overlay} />,
    );
    const before = layer(SEGMENT_OVERLAY_LAYER_ID);
    rerender(
      <MapView
        styleUrl={STYLE}
        data={twoRides}
        fitBounds={null}
        segmentOverlay={overlay}
        onSegmentSelect={() => undefined}
      />,
    );
    expect(layer(SEGMENT_OVERLAY_LAYER_ID)).toBe(before);
  });

  it('brings a selected segment into view', () => {
    const focus: GeoBounds = { west: 1, south: 1, east: 1.01, north: 1.01 };
    render(<MapView styleUrl={STYLE} data={null} fitBounds={null} focusBounds={focus} />);
    expect(onlyMap().fitBoundsCalls).toEqual([
      [
        [
          [1, 1],
          [1.01, 1.01],
        ],
        expect.objectContaining({ padding: FIT_BOUNDS_PADDING_PX }),
      ],
    ]);
  });
});

import { PathLayer } from '@deck.gl/layers';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  FIT_BOUNDS_MAX_ZOOM,
  FIT_BOUNDS_PADDING_PX,
  INITIAL_VIEW,
} from '@/components/map/mapConfig';
import { MapView } from '@/components/map/MapView';
import { heatColor, heatWidth } from '@/components/map/heatStyle';
import { ROUTE_LAYER_ID } from '@/components/map/routeLayer';
import { frequencyToIntensity } from '@/features/heatmap/services/aggregateHeatMap';
import type { GeoBounds, HeatMapData, HeatMapPath } from '@/types';
import {
  FakeMap,
  FakeMapboxOverlay,
  FakeNavigationControl,
  workerUrls,
} from '../../../mocks/mapLibraries';

const STYLE = 'https://tiles.example.org/style.json';

const twoRides: HeatMapData = {
  paths: [
    {
      coordinates: [
        [0, 0],
        [0.01, 0.01],
      ],
      frequency: 1,
      intensity: frequencyToIntensity(1, 5),
    },
    {
      coordinates: [
        [1, 1],
        [1.01, 1.01],
      ],
      frequency: 5,
      intensity: 1,
    },
  ],
  maxFrequency: 5,
  activityIds: ['a', 'b'],
};

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

  it('draws the prepared routes as a deck.gl path layer', () => {
    render(<MapView styleUrl={STYLE} data={twoRides} fitBounds={null} />);

    const [layer] = onlyOverlay().props.layers ?? [];
    expect(layer).toBeInstanceOf(PathLayer);
    expect((layer as PathLayer).id).toBe(ROUTE_LAYER_ID);
    expect((layer as PathLayer).props.data).toHaveLength(2);
    expect(screen.getByRole('status')).toHaveTextContent('Showing 2 rides on the map');
    expect(screen.queryByText(/Load your Strava export ZIP/)).not.toBeInTheDocument();
  });

  it('BR-12: colours and sizes each path by its intensity', () => {
    render(<MapView styleUrl={STYLE} data={twoRides} fitBounds={null} />);

    const layer = onlyOverlay().props.layers?.[0] as PathLayer<HeatMapPath>;
    const getColor = layer.props.getColor as unknown as (path: HeatMapPath) => number[];
    const getWidth = layer.props.getWidth as unknown as (path: HeatMapPath) => number;
    const [quiet, busy] = twoRides.paths as [HeatMapPath, HeatMapPath];

    expect(getColor(busy)).toEqual(heatColor(1));
    expect(getColor(quiet)).toEqual(heatColor(quiet.intensity));
    expect(getWidth(busy)).toBeGreaterThan(getWidth(quiet));
    expect(getWidth(busy)).toBe(heatWidth(1));
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

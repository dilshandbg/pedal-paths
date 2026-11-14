import type { PathLayer } from '@deck.gl/layers';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/app/App';
import { useActivitiesStore } from '@/features/activities/store/activitiesStore';
import { buildSegmentIndex } from '@/features/heatmap/services/buildSegmentIndex';
import { useFilterStore } from '@/features/filters/store/filterStore';
import type { CyclingActivity, HeatMapPath, ImportResult } from '@/types';
import { FakeMap, FakeMapboxOverlay } from '../mocks/mapLibraries';

// jsdom has no Web Workers: replace the worker-backed importer with a controllable fake.
const fakeImport = vi.hoisted(() => vi.fn());
vi.mock('@/features/activities/workers/runImportInWorker', () => ({
  runImportInWorker: fakeImport,
}));

/** Rides on the same ~1.1 km road (110 m steps, within the heat map's gap limit). */
const ride = (activityId: string, activityName: string): CyclingActivity => ({
  activityId,
  activityName,
  activityDate: '2024-01-01T08:00:00.000Z',
  year: 2024,
  month: 1,
  distanceKm: 10,
  elevationGainM: 100,
  gpsTrack: Array.from({ length: 11 }, (_, k) => ({
    latitude: k * 0.001,
    longitude: 0,
    elevation: null,
    timestamp: null,
  })),
});

const loaded = (activities: CyclingActivity[]): ImportResult => ({
  ok: true,
  activities,
  issues: [],
  excludedNonRideCount: 0,
  segmentIndex: buildSegmentIndex(activities),
});

const zipFile = () => new File(['PK'], 'export.zip', { type: 'application/zip' });

/** Paths currently handed to deck.gl. */
const drawnPaths = (): readonly HeatMapPath[] => {
  const layer = FakeMapboxOverlay.instances.at(-1)?.props.layers?.[0] as
    PathLayer<HeatMapPath> | undefined;
  return (layer?.props.data as readonly HeatMapPath[] | undefined) ?? [];
};
const maxDrawnFrequency = () => Math.max(0, ...drawnPaths().map((path) => path.frequency));

async function loadRides(activities: CyclingActivity[]) {
  const user = userEvent.setup();
  fakeImport.mockResolvedValue(loaded(activities));
  render(<App />);
  await user.upload(screen.getByLabelText('Strava export ZIP file'), zipFile());
  await screen.findByText(`Showing ${activities.length} rides on the map`, {}, { timeout: 15_000 });
  return user;
}

describe('BR-09: individual ride filter on the dashboard', () => {
  beforeEach(() => {
    useActivitiesStore.setState(useActivitiesStore.getInitialState(), true);
    useFilterStore.setState(useFilterStore.getInitialState(), true);
    fakeImport.mockReset();
  });

  it('lists every loaded ride, all selected at first', async () => {
    await loadRides([ride('1', 'Commute'), ride('2', 'Long loop'), ride('3', 'Hill repeats')]);

    const rides = screen.getByRole('group', { name: 'Rides' });
    const boxes = within(rides).getAllByRole('checkbox');
    expect(boxes).toHaveLength(3);
    for (const box of boxes) expect(box).toBeChecked();
  });

  it('AC-09: deselecting a ride removes its contribution; reselecting restores it', async () => {
    const user = await loadRides([ride('1', 'Commute'), ride('2', 'Long loop')]);
    expect(maxDrawnFrequency()).toBe(2);

    await user.click(screen.getByRole('checkbox', { name: 'Long loop' }));
    expect(await screen.findByText('Showing 1 ride on the map')).toBeInTheDocument();
    expect(maxDrawnFrequency()).toBe(1);

    await user.click(screen.getByRole('checkbox', { name: 'Commute' }));
    expect(await screen.findByText('Showing 0 rides on the map')).toBeInTheDocument();
    expect(drawnPaths()).toEqual([]);

    await user.click(screen.getByRole('checkbox', { name: 'Commute' }));
    await user.click(screen.getByRole('checkbox', { name: 'Long loop' }));
    expect(await screen.findByText('Showing 2 rides on the map')).toBeInTheDocument();
    expect(maxDrawnFrequency()).toBe(2);
  });

  it('keeps the map view where it is when rides are toggled', async () => {
    const user = await loadRides([ride('1', 'Commute'), ride('2', 'Long loop')]);
    const map = FakeMap.instances.at(-1);
    await waitFor(() => expect(map?.fitBoundsCalls).toHaveLength(1));

    await user.click(screen.getByRole('checkbox', { name: 'Long loop' }));
    await screen.findByText('Showing 1 ride on the map');
    expect(map?.fitBoundsCalls).toHaveLength(1);
  });
});

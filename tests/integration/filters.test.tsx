import type { PathLayer } from '@deck.gl/layers';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/app/App';
import { useActivitiesStore } from '@/features/activities/store/activitiesStore';
import { buildSegmentIndex } from '@/features/heatmap/services/buildSegmentIndex';
import { useFilterStore } from '@/features/filters/store/filterStore';
import type { CyclingActivity, HeatMapPath, ImportResult, Month } from '@/types';
import { FakeMap, FakeMapboxOverlay } from '../mocks/mapLibraries';

// jsdom has no Web Workers: replace the worker-backed importer with a controllable fake.
const fakeImport = vi.hoisted(() => vi.fn());
vi.mock('@/features/activities/workers/runImportInWorker', () => ({
  runImportInWorker: fakeImport,
}));

/** Rides on the same ~1.1 km road (110 m steps, within the heat map's gap limit). */
const ride = (
  activityId: string,
  activityName: string,
  year = 2024,
  month: Month = 6,
): CyclingActivity => ({
  activityId,
  activityName,
  activityDate: `${year}-${String(month).padStart(2, '0')}-15T08:00:00.000Z`,
  year,
  month,
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

describe('BR-07: year filter on the dashboard', () => {
  beforeEach(() => {
    useActivitiesStore.setState(useActivitiesStore.getInitialState(), true);
    useFilterStore.setState(useFilterStore.getInitialState(), true);
    fakeImport.mockReset();
  });

  const threeYears = () => [
    ride('1', 'Spring 2024', 2024),
    ride('2', 'Summer 2023', 2023),
    ride('3', 'Autumn 2023', 2023),
    ride('4', 'Old ride', 2022),
  ];

  it('offers the years in the export, newest first, with all years selected', async () => {
    await loadRides(threeYears());

    const years = screen.getByRole('group', { name: 'Years' });
    const labels = within(years)
      .getAllByRole('checkbox')
      .map((box) => box.closest('label')?.textContent);
    expect(labels).toEqual(['All years', '2024', '2023', '2022']);
    expect(within(years).getByRole('checkbox', { name: 'All years' })).toBeChecked();
  });

  it('AC-07: selecting years narrows the map and ride list; deselecting removes them', async () => {
    const user = await loadRides(threeYears());
    const years = screen.getByRole('group', { name: 'Years' });
    const rideList = screen.getByRole('group', { name: 'Rides' });

    await user.click(within(years).getByRole('checkbox', { name: '2023' }));
    expect(await screen.findByText('Showing 2 rides on the map')).toBeInTheDocument();
    expect(within(years).getByRole('checkbox', { name: 'All years' })).not.toBeChecked();
    expect(within(rideList).getAllByRole('checkbox')).toHaveLength(2);
    expect(within(rideList).getByRole('checkbox', { name: 'Summer 2023' })).toBeInTheDocument();
    expect(within(rideList).getByRole('checkbox', { name: 'Autumn 2023' })).toBeInTheDocument();
    expect(maxDrawnFrequency()).toBe(2);

    await user.click(within(years).getByRole('checkbox', { name: '2022' }));
    expect(await screen.findByText('Showing 3 rides on the map')).toBeInTheDocument();

    await user.click(within(years).getByRole('checkbox', { name: '2023' }));
    expect(await screen.findByText('Showing 1 ride on the map')).toBeInTheDocument();
    expect(within(rideList).getByRole('checkbox', { name: 'Old ride' })).toBeChecked();
  });

  it('RULE-09: deselecting the last year, or choosing "All years", shows every ride again', async () => {
    const user = await loadRides(threeYears());
    const years = screen.getByRole('group', { name: 'Years' });

    await user.click(within(years).getByRole('checkbox', { name: '2024' }));
    await screen.findByText('Showing 1 ride on the map');
    await user.click(within(years).getByRole('checkbox', { name: '2024' }));
    expect(await screen.findByText('Showing 4 rides on the map')).toBeInTheDocument();

    await user.click(within(years).getByRole('checkbox', { name: '2022' }));
    await screen.findByText('Showing 1 ride on the map');
    await user.click(within(years).getByRole('checkbox', { name: 'All years' }));
    expect(await screen.findByText('Showing 4 rides on the map')).toBeInTheDocument();
  });

  it('keeps deselected rides out when their year is selected (ADR-0005)', async () => {
    const user = await loadRides(threeYears());

    await user.click(screen.getByRole('checkbox', { name: 'Summer 2023' }));
    await screen.findByText('Showing 3 rides on the map');
    await user.click(screen.getByRole('checkbox', { name: '2023' }));

    expect(await screen.findByText('Showing 1 ride on the map')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Summer 2023' })).not.toBeChecked();
  });
});

describe('BR-08: month filter on the dashboard', () => {
  beforeEach(() => {
    useActivitiesStore.setState(useActivitiesStore.getInitialState(), true);
    useFilterStore.setState(useFilterStore.getInitialState(), true);
    fakeImport.mockReset();
  });

  const seasons = () => [
    ride('1', 'November 2023', 2023, 11),
    ride('2', 'December 2023', 2023, 12),
    ride('3', 'November 2022', 2022, 11),
    ride('4', 'January 2024', 2024, 1),
  ];

  it('offers January to December, with all months selected', async () => {
    await loadRides(seasons());

    const months = screen.getByRole('group', { name: 'Months' });
    const boxes = within(months).getAllByRole('checkbox');
    expect(boxes).toHaveLength(13);
    expect(within(months).getByRole('checkbox', { name: 'All months' })).toBeChecked();
    expect(boxes[1]).toHaveAccessibleName('January');
    expect(boxes[12]).toHaveAccessibleName('December');
  });

  it('AC-08: deselecting a month removes its rides, subject to the year filter', async () => {
    const user = await loadRides(seasons());
    const years = screen.getByRole('group', { name: 'Years' });
    const months = screen.getByRole('group', { name: 'Months' });
    const rideList = screen.getByRole('group', { name: 'Rides' });

    await user.click(within(months).getByRole('checkbox', { name: 'November' }));
    await user.click(within(months).getByRole('checkbox', { name: 'December' }));
    expect(await screen.findByText('Showing 3 rides on the map')).toBeInTheDocument();

    await user.click(within(years).getByRole('checkbox', { name: '2023' }));
    expect(await screen.findByText('Showing 2 rides on the map')).toBeInTheDocument();

    await user.click(within(months).getByRole('checkbox', { name: 'December' }));
    expect(await screen.findByText('Showing 1 ride on the map')).toBeInTheDocument();
    expect(within(rideList).getAllByRole('checkbox')).toHaveLength(1);
    expect(within(rideList).getByRole('checkbox', { name: 'November 2023' })).toBeChecked();
  });

  it('AC-10: the same month across several selected years', async () => {
    const user = await loadRides(seasons());
    const years = screen.getByRole('group', { name: 'Years' });
    const months = screen.getByRole('group', { name: 'Months' });

    await user.click(within(years).getByRole('checkbox', { name: '2023' }));
    await user.click(within(years).getByRole('checkbox', { name: '2022' }));
    await user.click(within(months).getByRole('checkbox', { name: 'November' }));

    expect(await screen.findByText('Showing 2 rides on the map')).toBeInTheDocument();
    const rideList = screen.getByRole('group', { name: 'Rides' });
    expect(within(rideList).getByRole('checkbox', { name: 'November 2023' })).toBeInTheDocument();
    expect(within(rideList).getByRole('checkbox', { name: 'November 2022' })).toBeInTheDocument();
    expect(maxDrawnFrequency()).toBe(2);
  });

  it('RULE-09: "All months" shows every month again', async () => {
    const user = await loadRides(seasons());
    const months = screen.getByRole('group', { name: 'Months' });

    await user.click(within(months).getByRole('checkbox', { name: 'January' }));
    await screen.findByText('Showing 1 ride on the map');
    await user.click(within(months).getByRole('checkbox', { name: 'All months' }));

    expect(await screen.findByText('Showing 4 rides on the map')).toBeInTheDocument();
    expect(within(months).getByRole('checkbox', { name: 'All months' })).toBeChecked();
  });
});

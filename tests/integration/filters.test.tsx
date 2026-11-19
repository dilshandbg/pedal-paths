import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/app/App';
import { useActivitiesStore } from '@/features/activities/store/activitiesStore';
import { useFilterStore } from '@/features/filters/store/filterStore';
import type { CyclingActivity, Month } from '@/types';
import { fakeRideHistory } from '../mocks/fakeRideHistory';
import { FakeMap, FakeMapboxOverlay } from '../mocks/mapLibraries';

// These tests wait for the lazy-loaded map (up to 15 s): give them room beyond the 5 s default,
// which a cold map import can exceed while the whole suite runs in parallel.
vi.setConfig({ testTimeout: 20_000 });

// jsdom has no Web Workers or backend: an in-memory ride history replaces both.
vi.mock('@/features/activities/store/rideHistoryServices', async () => ({
  rideHistoryServices: (await import('../mocks/fakeRideHistory')).fakeRideHistory.services,
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
  movingTimeS: 1800,
  gpsTrack: Array.from({ length: 11 }, (_, k) => ({
    latitude: k * 0.001,
    longitude: 0,
    elevation: null,
    timestamp: null,
  })),
});

const zipFile = () => new File(['PK'], 'export.zip', { type: 'application/zip' });

/** Number of road segments currently drawn (non-zero width in the deck.gl segment layer). */
const drawnSegmentCount = (): number => {
  const layer = FakeMapboxOverlay.instances.at(-1)?.props.layers?.[0] as
    { props: { data: { attributes: { getWidth: { value: Float32Array } } } } } | undefined;
  return layer?.props.data.attributes.getWidth.value.filter((width) => width > 0).length ?? 0;
};
/** Busiest road's ride count, as the heat map legend shows it (0 when nothing is drawn). */
const maxDrawnFrequency = (): number => {
  const legend = screen.queryByRole('figure', { name: 'Heat map legend' });
  const match = /([\d,]+) rides?$/.exec(legend?.textContent ?? '');
  return match?.[1] ? Number(match[1].replace(/,/g, '')) : 0;
};

async function loadRides(activities: CyclingActivity[]) {
  const user = userEvent.setup();
  fakeRideHistory.queueArchive({ activities });
  render(<App />);
  // Uploads open once the stored history has loaded (BR-33).
  const input = screen.getByLabelText('Strava export ZIP file');
  await waitFor(() => expect(input).toBeEnabled());
  await user.upload(input, zipFile());
  await screen.findByText(`Showing ${activities.length} rides on the map`, {}, { timeout: 15_000 });
  return user;
}

describe('BR-09: individual ride filter on the dashboard', () => {
  beforeEach(() => {
    useActivitiesStore.setState(useActivitiesStore.getInitialState(), true);
    useFilterStore.setState(useFilterStore.getInitialState(), true);
    fakeRideHistory.reset();
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
    expect(drawnSegmentCount()).toBe(0);
    expect(maxDrawnFrequency()).toBe(0);

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
    fakeRideHistory.reset();
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
    fakeRideHistory.reset();
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

describe('BR-11: combined filters on the dashboard', () => {
  beforeEach(() => {
    useActivitiesStore.setState(useActivitiesStore.getInitialState(), true);
    useFilterStore.setState(useFilterStore.getInitialState(), true);
    fakeRideHistory.reset();
  });

  const summaryValue = (label: string) => {
    const region = screen.getByRole('region', { name: 'Active filters' });
    const term = within(region).getByText(label, { selector: 'dt' });
    return term.nextElementSibling?.textContent;
  };

  it('UX-06 / RULE-08: shows the active filters, and the map follows all of them', async () => {
    const user = await loadRides([
      ride('1', 'November 2023', 2023, 11),
      ride('2', 'Another November 2023', 2023, 11),
      ride('3', 'November 2022', 2022, 11),
      ride('4', 'June 2023', 2023, 6),
    ]);
    expect(summaryValue('Years')).toBe('All years');
    expect(summaryValue('Months')).toBe('All months');
    expect(summaryValue('Rides')).toBe('All rides');

    await user.click(screen.getByRole('checkbox', { name: '2023' }));
    await user.click(screen.getByRole('checkbox', { name: 'November' }));
    expect(await screen.findByText('Showing 2 rides on the map')).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: 'Another November 2023' }));
    expect(await screen.findByText('Showing 1 ride on the map')).toBeInTheDocument();
    expect(summaryValue('Years')).toBe('2023');
    expect(summaryValue('Months')).toBe('November');
    expect(summaryValue('Rides')).toBe('1 ride deselected');
  });

  it('an added export keeps the filters and adds its rides (ADR-0013 §4)', async () => {
    const user = await loadRides([ride('1', 'Old', 2023, 11), ride('2', 'Older', 2022, 3)]);
    await user.click(screen.getByRole('checkbox', { name: '2023' }));
    await user.click(screen.getByRole('checkbox', { name: 'November' }));
    await user.click(screen.getByRole('checkbox', { name: 'Old' }));
    expect(summaryValue('Rides')).toBe('1 ride deselected');

    fakeRideHistory.queueArchive({
      activities: [ride('9', 'New', 2023, 11), ride('8', 'Newer', 2024, 6)],
      fileHash: 'hash:second export',
    });
    await user.upload(screen.getByLabelText('Strava export ZIP file'), zipFile());

    // Only the added November 2023 ride matches the kept filters; 'Old' stays deselected.
    expect(await screen.findByText('Showing 1 ride on the map')).toBeInTheDocument();
    expect(summaryValue('Years')).toBe('2023');
    expect(summaryValue('Months')).toBe('November');
    expect(summaryValue('Rides')).toBe('1 ride deselected');
    expect(screen.getByRole('checkbox', { name: '2024' })).not.toBeChecked();
  });
});

describe('BR-15: reset filters on the dashboard', () => {
  beforeEach(() => {
    useActivitiesStore.setState(useActivitiesStore.getInitialState(), true);
    useFilterStore.setState(useFilterStore.getInitialState(), true);
    fakeRideHistory.reset();
  });

  it('AC-14: reset restores every eligible ride and clears all filter controls', async () => {
    const user = await loadRides([
      ride('1', 'November 2023', 2023, 11),
      ride('2', 'Another November 2023', 2023, 11),
      ride('3', 'June 2022', 2022, 6),
    ]);
    const reset = screen.getByRole('button', { name: 'Reset filters' });
    expect(reset).toBeDisabled();

    await user.click(screen.getByRole('checkbox', { name: '2023' }));
    await user.click(screen.getByRole('checkbox', { name: 'November' }));
    await user.click(screen.getByRole('checkbox', { name: 'Another November 2023' }));
    expect(await screen.findByText('Showing 1 ride on the map')).toBeInTheDocument();
    expect(reset).toBeEnabled();

    await user.click(reset);

    expect(await screen.findByText('Showing 3 rides on the map')).toBeInTheDocument();
    expect(maxDrawnFrequency()).toBe(3);
    expect(screen.getByRole('checkbox', { name: 'All years' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'All months' })).toBeChecked();
    const rideList = screen.getByRole('group', { name: 'Rides' });
    const rideBoxes = within(rideList).getAllByRole('checkbox');
    expect(rideBoxes).toHaveLength(3);
    for (const box of rideBoxes) expect(box).toBeChecked();
    expect(screen.getByRole('region', { name: 'Active filters' })).toHaveTextContent(
      /All years.*All months.*All rides/,
    );
    expect(reset).toBeDisabled();
  });
});

describe('BR-14: activity count and statistics on the dashboard', () => {
  beforeEach(() => {
    useActivitiesStore.setState(useActivitiesStore.getInitialState(), true);
    useFilterStore.setState(useFilterStore.getInitialState(), true);
    fakeRideHistory.reset();
  });

  const statistic = (label: string) => {
    const panel = screen.getByRole('region', { name: 'Statistics' });
    return within(panel).getByText(label, { selector: 'dt' }).nextElementSibling?.textContent;
  };

  it('AC-13 / AC-19: the count and totals follow the active filters', async () => {
    // The fixture gives every ride 10 km, 100 m of climbing and 30 min of moving time.
    const user = await loadRides([
      ride('1', 'November 2023', 2023, 11),
      ride('2', 'June 2023', 2023, 6),
      ride('3', 'November 2022', 2022, 11),
    ]);
    expect(statistic('Rides')).toBe('3 rides');
    expect(statistic('Distance')).toBe('30.0 km');
    expect(statistic('Elevation gain')).toBe('300 m');
    expect(statistic('Moving time')).toBe('1 h 30 min');
    expect(statistic('Average distance')).toBe('10.0 km');

    await user.click(screen.getByRole('checkbox', { name: 'November' }));
    expect(await screen.findByText('2 rides', { selector: 'dd' })).toBeInTheDocument();
    expect(statistic('Distance')).toBe('20.0 km');

    await user.click(screen.getByRole('checkbox', { name: 'November 2022' }));
    expect(await screen.findByText('1 ride', { selector: 'dd' })).toBeInTheDocument();
    expect(statistic('Elevation gain')).toBe('100 m');
    expect(statistic('Moving time')).toBe('30 min');

    await user.click(screen.getByRole('button', { name: 'Reset filters' }));
    expect(await screen.findByText('3 rides', { selector: 'dd' })).toBeInTheDocument();
  });
});

describe('BR-13: activity details on the dashboard', () => {
  beforeEach(() => {
    useActivitiesStore.setState(useActivitiesStore.getInitialState(), true);
    useFilterStore.setState(useFilterStore.getInitialState(), true);
    fakeRideHistory.reset();
  });

  it('shows each ride with its name, date, distance and elevation gain when available', async () => {
    await loadRides([
      ride('1', 'Known metrics', 2023, 11),
      { ...ride('2', 'No metrics', 2023, 6), distanceKm: null, elevationGainM: null },
    ]);

    const known = screen.getByRole('checkbox', { name: 'Known metrics' });
    expect(known).toHaveAccessibleDescription(/^Nov 15, 2023 · 10\.0 km · 100 m gain$/);
    const unknown = screen.getByRole('checkbox', { name: 'No metrics' });
    expect(unknown).toHaveAccessibleDescription(/^Jun 15, 2023$/);
  });
});

describe('BR-10: the heat map follows the filters without a reload', () => {
  beforeEach(() => {
    useActivitiesStore.setState(useActivitiesStore.getInitialState(), true);
    useFilterStore.setState(useFilterStore.getInitialState(), true);
    fakeRideHistory.reset();
  });

  it('AC-11 / RULE-11: every filter change replaces the layer on the same map instance', async () => {
    const user = await loadRides([
      ride('1', 'November 2023', 2023, 11),
      ride('2', 'June 2023', 2023, 6),
      ride('3', 'November 2022', 2022, 11),
    ]);
    const maps = FakeMap.instances.length;
    const overlays = FakeMapboxOverlay.instances.length;
    const layers: unknown[] = [];
    const recordLayer = () => layers.push(FakeMapboxOverlay.instances.at(-1)?.props.layers?.[0]);
    recordLayer();

    await user.click(screen.getByRole('checkbox', { name: '2023' }));
    await screen.findByText('Showing 2 rides on the map');
    recordLayer();
    await user.click(screen.getByRole('checkbox', { name: 'November' }));
    await screen.findByText('Showing 1 ride on the map');
    recordLayer();
    await user.click(screen.getByRole('checkbox', { name: 'November 2023' }));
    await screen.findByText('Showing 0 rides on the map');
    recordLayer();
    await user.click(screen.getByRole('button', { name: 'Reset filters' }));
    await screen.findByText('Showing 3 rides on the map');
    recordLayer();

    // Same map and overlay throughout; a new layer for each change.
    expect(FakeMap.instances).toHaveLength(maps);
    expect(FakeMapboxOverlay.instances).toHaveLength(overlays);
    expect(FakeMap.instances.at(-1)?.removed).toBe(false);
    expect(new Set(layers).size).toBe(layers.length);
    // The loaded export is kept: nothing was reloaded.
    expect(useActivitiesStore.getState().dataset?.activities).toHaveLength(3);
  });
});

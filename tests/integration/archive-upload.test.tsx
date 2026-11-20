import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/app/App';
import { useActivitiesStore } from '@/features/activities/store/activitiesStore';
import { useFilterStore } from '@/features/filters/store/filterStore';
import type { CyclingActivity } from '@/types';
import { fakeRideHistory } from '../mocks/fakeRideHistory';

// These tests wait for the lazy-loaded map (up to 15 s): give them room beyond the 5 s default,
// which a cold map import can exceed while the whole suite runs in parallel.
vi.setConfig({ testTimeout: 20_000 });

// jsdom has no Web Workers or backend: an in-memory ride history replaces both.
vi.mock('@/features/activities/store/rideHistoryServices', async () => ({
  rideHistoryServices: (await import('../mocks/fakeRideHistory')).fakeRideHistory.services,
}));

const ride = (activityId: string): CyclingActivity => ({
  activityId,
  activityName: `Ride ${activityId}`,
  activityDate: `2024-01-${activityId.padStart(2, '0')}T08:00:00.000Z`,
  year: 2024,
  month: 1,
  distanceKm: 10,
  elevationGainM: 100,
  movingTimeS: null,
  // ~1.1 km north in 110 m steps (within the heat map's gap limit).
  gpsTrack: Array.from({ length: 11 }, (_, k) => ({
    latitude: k * 0.001,
    longitude: 0,
    elevation: null,
    timestamp: null,
  })),
});
const rides = (...ids: string[]) => ids.map(ride);

const zipFile = (name = 'export_12345.zip') => new File(['PK'], name, { type: 'application/zip' });

const fileInput = () => screen.getByLabelText('Strava export ZIP file');

/** Renders the app and waits until the stored history has loaded and uploads are possible. */
async function renderApp() {
  const user = userEvent.setup();
  render(<App />);
  // Uploads open once the stored history has loaded (BR-33); allow for a busy parallel run.
  await waitFor(() => expect(fileInput()).toBeEnabled(), { timeout: 15_000 });
  return user;
}

const historyRegion = () => screen.getByRole('region', { name: 'Ride history' });
const lastUpload = () => screen.getByRole('region', { name: 'Last upload' });

beforeEach(() => {
  useActivitiesStore.setState(useActivitiesStore.getInitialState(), true);
  useFilterStore.setState(useFilterStore.getInitialState(), true);
  fakeRideHistory.reset();
});

describe('ZIP upload from the UI', () => {
  it('AC-01 / UX-01: offers a ZIP upload control', async () => {
    await renderApp();

    const input = fileInput();
    expect(input).toHaveAttribute('type', 'file');
    expect(input.getAttribute('accept')).toContain('.zip');
    expect(screen.getByText('Choose Strava export ZIP')).toBeInTheDocument();
  });

  it('AC-03 / UX-03 / UX-04: shows what was stored, excluded and skipped', async () => {
    fakeRideHistory.queueArchive({
      activities: rides('1', '2'),
      issues: [
        {
          activityId: '9',
          activityName: 'Trainer Ride',
          fileName: null,
          reason: 'missing-gps-file',
        },
      ],
      excludedNonRideCount: 5,
    });
    const user = await renderApp();

    await user.upload(fileInput(), zipFile());

    const summary = await screen.findByRole('region', { name: 'Last upload' });
    expect(within(summary).getByText('export_12345.zip')).toBeInTheDocument();
    expect(within(summary).getByText('2 rides in this file, 2 new')).toBeInTheDocument();
    expect(within(summary).getByText('5 non-ride activities excluded')).toBeInTheDocument();
    expect(within(summary).getByText('1 ride could not be processed')).toBeInTheDocument();
    expect(within(summary).getByText('Trainer Ride')).toBeInTheDocument();
    expect(within(historyRegion()).getByText('2 rides stored')).toBeInTheDocument();
    // The map is lazy-loaded, so wait for it to mount.
    expect(
      await screen.findByText('Showing 2 rides on the map', {}, { timeout: 15_000 }),
    ).toBeInTheDocument();
    expect(screen.getByText('Add another export ZIP')).toBeInTheDocument();
  });

  it('UX-02: shows progress while the archive is processed', async () => {
    fakeRideHistory.queueArchive({ activities: rides('1') });
    const user = await renderApp();
    const release = fakeRideHistory.holdNextImport({
      stage: 'parsing-activities',
      processed: 3,
      total: 10,
    });

    await user.upload(fileInput(), zipFile());

    expect(await screen.findByText('Processing rides: 3 of 10')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Import progress' })).toHaveAttribute(
      'value',
      '3',
    );
    expect(fileInput()).toBeDisabled();

    release();
    expect(await screen.findByText('1 ride stored')).toBeInTheDocument();
    expect(fileInput()).toBeEnabled();
  });

  it('AC-16: shows a clear message for an unusable file', async () => {
    fakeRideHistory.queueArchive({ fail: 'not-a-zip' });
    const user = await renderApp();

    await user.upload(fileInput(), zipFile('notes.zip'));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not load notes.zip');
    expect(alert).toHaveTextContent('not a ZIP archive');
  });

  it('keeps the stored rides when another upload fails', async () => {
    fakeRideHistory.queueArchive({ activities: rides('1') }, { fail: 'missing-activities-csv' });
    const user = await renderApp();

    await user.upload(fileInput(), zipFile('good.zip'));
    await screen.findByText('1 ride stored');
    await user.upload(fileInput(), zipFile('other.zip'));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your stored rides are still shown.',
    );
    expect(screen.getByText('1 ride stored')).toBeInTheDocument();
  });
});

describe('BR-16 / BR-33: cumulative, stored ride history', () => {
  it('AC-15 / AC-35: another export adds its rides and keeps the filters', async () => {
    fakeRideHistory.queueArchive({ activities: rides('1', '2', '3') }, { activities: rides('4') });
    const user = await renderApp();

    await user.upload(fileInput(), zipFile('first.zip'));
    expect(await screen.findByText('3 rides stored')).toBeInTheDocument();
    useFilterStore.getState().setFilter({ selectedYears: [2024], excludedActivityIds: ['1'] });
    await user.upload(fileInput(), zipFile('second.zip'));

    expect(await screen.findByText('4 rides stored')).toBeInTheDocument();
    expect(within(historyRegion()).getByText('from 2 uploads')).toBeInTheDocument();
    expect(within(lastUpload()).getByText('second.zip')).toBeInTheDocument();
    expect(within(lastUpload()).getByText('1 ride in this file, 1 new')).toBeInTheDocument();
    expect(useFilterStore.getState().filter).toEqual({
      selectedYears: [2024],
      selectedMonths: [],
      excludedActivityIds: ['1'],
    });
  });

  it('AC-34: shows the stored rides after a restart, without uploading again', async () => {
    fakeRideHistory.queueArchive({ activities: rides('1', '2') });
    const user = await renderApp();
    await user.upload(fileInput(), zipFile());
    await screen.findByText('2 rides stored');

    // Restart: a fresh app and store over the same stored history.
    cleanup();
    useActivitiesStore.setState(useActivitiesStore.getInitialState(), true);
    await renderApp();

    expect(await screen.findByText('2 rides stored')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Last upload' })).not.toBeInTheDocument();
    expect(
      await screen.findByText('Showing 2 rides on the map', {}, { timeout: 15_000 }),
    ).toBeInTheDocument();
  });

  it('says so when the ride storage is unavailable, and imports nothing', async () => {
    fakeRideHistory.setAvailable(false);
    fakeRideHistory.queueArchive({ activities: rides('1') });
    const user = await renderApp();

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Your stored rides could not be loaded because the local ride storage is not available.',
    );
    await user.upload(fileInput(), zipFile());

    expect(
      await screen.findByText(/could not be saved\. Nothing was imported/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Ride history' })).not.toBeInTheDocument();
  });
});

describe('BR-18 / BR-37: duplicate rides and files', () => {
  it('AC-18: a ride in several uploads appears once in the map, ride list and statistics', async () => {
    fakeRideHistory.queueArchive(
      { activities: rides('1', '2', '3') },
      { activities: rides('2', '3', '4') },
    );
    const user = await renderApp();

    await user.upload(fileInput(), zipFile('older.zip'));
    await screen.findByText('3 rides stored');
    await user.upload(fileInput(), zipFile('newer.zip'));

    expect(await screen.findByText('4 rides stored')).toBeInTheDocument();
    expect(within(lastUpload()).getByText('3 rides in this file, 1 new')).toBeInTheDocument();
    expect(
      await screen.findByText('Showing 4 rides on the map', {}, { timeout: 15_000 }),
    ).toBeInTheDocument();
    // The ride list renders after the map and statistics (useDeferredValue, NFR-10).
    await waitFor(
      () =>
        expect(
          within(screen.getByRole('group', { name: 'Rides' })).getAllByRole('checkbox'),
        ).toHaveLength(4),
      { timeout: 15_000 },
    );
    const statistics = within(screen.getByRole('region', { name: 'Statistics' }));
    expect(statistics.getByText('4 rides')).toBeInTheDocument();
  });

  it('AC-41: warns about a file that was already imported and imports nothing', async () => {
    fakeRideHistory.queueArchive(
      { activities: rides('1') },
      { activities: rides('2'), fileHash: 'hash:export.zip' },
    );
    const user = await renderApp();

    await user.upload(fileInput(), zipFile('export.zip'));
    await screen.findByText('1 ride stored');
    await user.upload(fileInput(), zipFile('export (1).zip'));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not load export (1).zip');
    expect(alert).toHaveTextContent(
      /This file was already imported on Nov 19, 2026 as “export\.zip”\. Nothing was imported again\./,
    );
    expect(screen.getByText('1 ride stored')).toBeInTheDocument();
    expect(fakeRideHistory.storedIds()).toEqual(['1']);
  });
});

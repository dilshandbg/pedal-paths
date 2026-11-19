import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/app/App';
import { useActivitiesStore } from '@/features/activities/store/activitiesStore';
import { useFilterStore } from '@/features/filters/store/filterStore';
import type { CyclingActivity } from '@/types';
import { fakeRideHistory } from '../mocks/fakeRideHistory';

// These tests render the whole app, including the lazy-loaded map: give them room beyond the 5 s
// default, which a cold map import can exceed while the whole suite runs in parallel.
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
  gpsTrack: Array.from({ length: 11 }, (_, k) => ({
    latitude: k * 0.001,
    longitude: 0,
    elevation: null,
    timestamp: null,
  })),
});
const rides = (...ids: string[]) => ids.map(ride);
const zipFile = (name: string) => new File(['PK'], name, { type: 'application/zip' });

/** Uploads exports through the Rides tab, then opens the Uploads tab. */
async function withUploads(...exports: [name: string, activityIds: string[]][]) {
  const user = userEvent.setup();
  render(<App />);
  const input = screen.getByLabelText('Strava export ZIP file');
  await waitFor(() => expect(input).toBeEnabled());
  let stored = new Set<string>();
  for (const [name, ids] of exports) {
    fakeRideHistory.queueArchive({ activities: rides(...ids) });
    await user.upload(screen.getByLabelText('Strava export ZIP file'), zipFile(name));
    stored = new Set([...stored, ...ids]);
    await screen.findByText(`${stored.size} ${stored.size === 1 ? 'ride' : 'rides'} stored`);
  }
  await user.click(screen.getByRole('tab', { name: 'Uploads' }));
  return user;
}

const uploadNames = () =>
  within(screen.getByRole('list', { name: 'Uploads' }))
    .getAllByRole('listitem')
    .map((row) => row.getAttribute('aria-label'));

beforeEach(() => {
  useActivitiesStore.setState(useActivitiesStore.getInitialState(), true);
  useFilterStore.setState(useFilterStore.getInitialState(), true);
  fakeRideHistory.reset();
});

describe('BR-35: the Uploads screen', () => {
  it('AC-36: lists every upload, newest first, with its registry details', async () => {
    await withUploads(['older.zip', ['1', '2']], ['newer.zip', ['2', '3', '4']]);

    expect(uploadNames()).toEqual(['newer.zip', 'older.zip']);
    const newer = within(screen.getByRole('listitem', { name: 'newer.zip' }));
    expect(newer.getByText('3 rides (2 new)')).toBeInTheDocument();
    expect(newer.getByText('30.0 km')).toBeInTheDocument();
    expect(newer.getByText('Complete')).toBeInTheDocument();
    expect(newer.getByText(/^Nov 19, 2026, /)).toBeInTheDocument();
  });

  it('says when there are no uploads', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('tab', { name: 'Uploads' }));

    expect(await screen.findByText('No uploads yet.')).toBeInTheDocument();
  });

  it('AC-37: deleting one upload keeps the rides another upload also contains', async () => {
    const user = await withUploads(['older.zip', ['1', '2']], ['newer.zip', ['2', '3']]);
    const older = within(screen.getByRole('listitem', { name: 'older.zip' }));

    await user.click(older.getByRole('button', { name: 'Delete' }));
    await user.click(older.getByRole('button', { name: 'Delete upload' }));

    expect(await screen.findByText('Deleted 1 upload and 1 ride.')).toBeInTheDocument();
    expect(uploadNames()).toEqual(['newer.zip']);
    expect(fakeRideHistory.storedIds()).toEqual(['2', '3']);
    await user.click(screen.getByRole('tab', { name: 'Rides' }));
    expect(screen.getByText('2 rides stored')).toBeInTheDocument();
  });

  it('AC-38: deletes the selected uploads together', async () => {
    const user = await withUploads(['a.zip', ['1']], ['b.zip', ['2']], ['c.zip', ['3']]);

    await user.click(screen.getByRole('checkbox', { name: 'Select a.zip' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select c.zip' }));
    await user.click(screen.getByRole('button', { name: 'Delete selected (2)' }));
    expect(screen.getByText(/^Delete 2 uploads\?/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Delete selected' }));

    expect(await screen.findByText('Deleted 2 uploads and 2 rides.')).toBeInTheDocument();
    expect(uploadNames()).toEqual(['b.zip']);
    expect(screen.getByRole('button', { name: 'Delete selected (0)' })).toBeDisabled();
  });

  it('AC-39: "Delete all" asks first; cancelling removes nothing, confirming removes everything', async () => {
    const user = await withUploads(['a.zip', ['1', '2']], ['b.zip', ['3']]);

    await user.click(screen.getByRole('button', { name: 'Delete all uploads' }));
    expect(
      screen.getByText(
        'Delete all 2 uploads and every stored ride from this device? This cannot be undone.',
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(uploadNames()).toHaveLength(2);
    expect(fakeRideHistory.services.client.deleteAll).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Delete all uploads' }));
    await user.click(screen.getByRole('button', { name: 'Delete all' }));

    expect(await screen.findByText('Deleted 2 uploads and 3 rides.')).toBeInTheDocument();
    expect(screen.getByText('No uploads yet.')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Rides' }));
    expect(screen.getByText('Choose Strava export ZIP')).toBeInTheDocument();
  });

  it('removes deleted rides from the ride filter (ADR-0013 §4)', async () => {
    const user = await withUploads(['a.zip', ['1']], ['b.zip', ['2']]);
    useFilterStore.getState().setFilter({ excludedActivityIds: ['1', '2'] });

    const first = within(screen.getByRole('listitem', { name: 'a.zip' }));
    await user.click(first.getByRole('button', { name: 'Delete' }));
    await user.click(first.getByRole('button', { name: 'Delete upload' }));

    await waitFor(() =>
      expect(useFilterStore.getState().filter.excludedActivityIds).toEqual(['2']),
    );
  });

  it('AC-40: a failed deletion removes nothing and explains', async () => {
    const user = await withUploads(['a.zip', ['1']]);
    fakeRideHistory.failNextDelete('storage-error');
    const row = within(screen.getByRole('listitem', { name: 'a.zip' }));

    await user.click(row.getByRole('button', { name: 'Delete' }));
    await user.click(row.getByRole('button', { name: 'Delete upload' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The uploads could not be deleted. Nothing was deleted.',
    );
    expect(uploadNames()).toEqual(['a.zip']);
    expect(fakeRideHistory.storedIds()).toEqual(['1']);
  });
});

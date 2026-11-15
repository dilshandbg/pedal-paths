import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/app/App';
import { useActivitiesStore } from '@/features/activities/store/activitiesStore';
import { buildSegmentIndex } from '@/features/heatmap/services/buildSegmentIndex';
import { useFilterStore } from '@/features/filters/store/filterStore';
import type { CyclingActivity, ImportResult } from '@/types';

// jsdom has no Web Workers: replace the worker-backed importer with a controllable fake.
const fakeImport = vi.hoisted(() => vi.fn());
vi.mock('@/features/activities/workers/runImportInWorker', () => ({
  runImportInWorker: fakeImport,
}));

const ride = (activityId: string): CyclingActivity => ({
  activityId,
  activityName: `Ride ${activityId}`,
  activityDate: '2024-01-01T08:00:00.000Z',
  year: 2024,
  month: 1,
  distanceKm: 10,
  elevationGainM: 100,
  // ~1.1 km north in 110 m steps (within the heat map's gap limit).
  gpsTrack: Array.from({ length: 11 }, (_, k) => ({
    latitude: k * 0.001,
    longitude: 0,
    elevation: null,
    timestamp: null,
  })),
});

/** A successful import result for these rides, with a real heat map segment index. */
const loaded = (
  activities: CyclingActivity[],
  extras: Partial<
    Pick<Extract<ImportResult, { ok: true }>, 'issues' | 'excludedNonRideCount'>
  > = {},
): ImportResult => ({
  ok: true,
  activities,
  issues: [],
  excludedNonRideCount: 0,
  segmentIndex: buildSegmentIndex(activities),
  ...extras,
});

const zipFile = (name = 'export_12345.zip') => new File(['PK'], name, { type: 'application/zip' });

const fileInput = () => screen.getByLabelText('Strava export ZIP file');

describe('ZIP upload from the UI', () => {
  beforeEach(() => {
    useActivitiesStore.setState(useActivitiesStore.getInitialState(), true);
    useFilterStore.setState(useFilterStore.getInitialState(), true);
    fakeImport.mockReset();
  });

  it('AC-01 / UX-01: offers a ZIP upload control', () => {
    render(<App />);

    const input = fileInput();
    expect(input).toHaveAttribute('type', 'file');
    expect(input.getAttribute('accept')).toContain('.zip');
    expect(screen.getByText('Choose Strava export ZIP')).toBeInTheDocument();
  });

  it('AC-03 / UX-03 / UX-04: shows what was loaded, excluded and skipped', async () => {
    fakeImport.mockResolvedValue(
      loaded([ride('1'), ride('2')], {
        issues: [
          {
            activityId: '9',
            activityName: 'Trainer Ride',
            fileName: null,
            reason: 'missing-gps-file',
          },
        ],
        excludedNonRideCount: 5,
      }),
    );
    const user = userEvent.setup();
    render(<App />);

    await user.upload(fileInput(), zipFile());

    const summary = await screen.findByRole('region', { name: 'Loaded data' });
    expect(within(summary).getByText('2 rides loaded')).toBeInTheDocument();
    expect(within(summary).getByText('5 non-ride activities excluded')).toBeInTheDocument();
    expect(within(summary).getByText('1 ride could not be processed')).toBeInTheDocument();
    expect(within(summary).getByText('Trainer Ride')).toBeInTheDocument();
    // The map is lazy-loaded, so wait for it to mount.
    expect(
      await screen.findByText('Showing 2 rides on the map', {}, { timeout: 15_000 }),
    ).toBeInTheDocument();
    expect(screen.getByText('Load a different ZIP')).toBeInTheDocument();
  });

  it('UX-02: shows progress while the archive is processed', async () => {
    let finish: (result: ImportResult) => void = () => {};
    fakeImport.mockImplementation(
      (_file: File, onStatus: (status: unknown) => void) =>
        new Promise<ImportResult>((resolve) => {
          onStatus({ stage: 'parsing-activities', processed: 3, total: 10 });
          finish = resolve;
        }),
    );
    const user = userEvent.setup();
    render(<App />);

    await user.upload(fileInput(), zipFile());

    expect(await screen.findByText('Processing rides: 3 of 10')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Import progress' })).toHaveAttribute(
      'value',
      '3',
    );
    expect(fileInput()).toBeDisabled();

    finish(loaded([ride('1')]));
    expect(await screen.findByText('1 ride loaded')).toBeInTheDocument();
    expect(fileInput()).toBeEnabled();
  });

  it('AC-16: shows a clear message for an unusable file', async () => {
    fakeImport.mockResolvedValue({ ok: false, reason: 'not-a-zip' } satisfies ImportResult);
    const user = userEvent.setup();
    render(<App />);

    await user.upload(fileInput(), zipFile('notes.zip'));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not load notes.zip');
    expect(alert).toHaveTextContent('not a ZIP archive');
  });

  it('AC-15: loading a new ZIP replaces the dataset and resets the filters', async () => {
    fakeImport
      .mockResolvedValueOnce(loaded([ride('1'), ride('2'), ride('3')]))
      .mockResolvedValueOnce(loaded([ride('4')]));
    const user = userEvent.setup();
    render(<App />);

    await user.upload(fileInput(), zipFile('first.zip'));
    expect(await screen.findByText('3 rides loaded')).toBeInTheDocument();

    useFilterStore.getState().setFilter({ selectedYears: [2024], excludedActivityIds: ['1'] });
    await user.upload(fileInput(), zipFile('second.zip'));

    expect(await screen.findByText('1 ride loaded')).toBeInTheDocument();
    expect(screen.getByText('second.zip')).toBeInTheDocument();
    await waitFor(() =>
      expect(useFilterStore.getState().filter).toEqual({
        selectedYears: [],
        selectedMonths: [],
        excludedActivityIds: [],
      }),
    );
  });

  it('keeps the previous data when a replacement fails', async () => {
    fakeImport
      .mockResolvedValueOnce(loaded([ride('1')]))
      .mockResolvedValueOnce({ ok: false, reason: 'missing-activities-csv' });
    const user = userEvent.setup();
    render(<App />);

    await user.upload(fileInput(), zipFile('good.zip'));
    await screen.findByText('1 ride loaded');
    await user.upload(fileInput(), zipFile('other.zip'));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your previously loaded data is still shown.',
    );
    expect(screen.getByText('1 ride loaded')).toBeInTheDocument();
  });
});

describe('BR-18: duplicate rides', () => {
  beforeEach(() => {
    useActivitiesStore.setState(useActivitiesStore.getInitialState(), true);
    useFilterStore.setState(useFilterStore.getInitialState(), true);
    fakeImport.mockReset();
  });

  it('AC-18: loading the same ZIP twice replaces the rides instead of adding them again', async () => {
    fakeImport.mockResolvedValue(loaded([ride('1'), ride('2'), ride('3')]));
    const user = userEvent.setup();
    render(<App />);

    await user.upload(fileInput(), zipFile());
    expect(await screen.findByText('3 rides loaded')).toBeInTheDocument();
    await user.upload(fileInput(), zipFile());
    await waitFor(() => expect(fakeImport).toHaveBeenCalledTimes(2));

    expect(await screen.findByText('3 rides loaded')).toBeInTheDocument();
    expect(
      await screen.findByText('Showing 3 rides on the map', {}, { timeout: 15_000 }),
    ).toBeInTheDocument();
    const rides = within(screen.getByRole('group', { name: 'Rides' }));
    expect(rides.getAllByRole('checkbox')).toHaveLength(3);
    const statistics = within(screen.getByRole('region', { name: 'Statistics' }));
    expect(statistics.getByText('3 rides')).toBeInTheDocument();
  });
});

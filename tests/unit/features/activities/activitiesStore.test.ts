import { beforeEach, describe, expect, it } from 'vitest';
import { useActivitiesStore } from '@/features/activities/store/activitiesStore';
import type { RideHistoryServices } from '@/features/activities/store/rideHistoryServices';
import { buildSegmentIndex } from '@/features/heatmap/services/buildSegmentIndex';
import type { CyclingActivity } from '@/types';
import { createFakeRideHistory, type FakeRideHistory } from '../../../mocks/fakeRideHistory';

const activity = (activityId: string, patch: Partial<CyclingActivity> = {}): CyclingActivity => ({
  activityId,
  activityName: `Ride ${activityId}`,
  activityDate: `2024-01-${activityId.padStart(2, '0')}T08:00:00.000Z`,
  year: 2024,
  month: 1,
  distanceKm: 10,
  elevationGainM: 100,
  movingTimeS: null,
  gpsTrack: [
    { latitude: 0, longitude: 0, elevation: null, timestamp: null },
    { latitude: 0.001, longitude: 0, elevation: null, timestamp: null },
  ],
  ...patch,
});

const rides = (...ids: string[]) => ({ activities: ids.map((id) => activity(id)) });
const zipFile = (name: string) => new File(['zip'], name, { type: 'application/zip' });

let fake: FakeRideHistory;
let services: RideHistoryServices;
const store = () => useActivitiesStore.getState();
const shownIds = () => store().dataset?.activities.map((a) => a.activityId) ?? [];

beforeEach(() => {
  useActivitiesStore.setState(useActivitiesStore.getInitialState(), true);
  fake = createFakeRideHistory();
  services = fake.services;
});

describe('BR-33: ride history at startup', () => {
  it('starts with no rides, loading the history', () => {
    expect(store().dataset).toBeNull();
    expect(store().history).toBe('loading');
    expect(store().status).toEqual({ stage: 'idle' });
  });

  it('AC-34: shows the stored rides and uploads when the app starts', async () => {
    fake.queueArchive(rides('1', '2'));
    await store().loadArchive(zipFile('export.zip'), services);
    useActivitiesStore.setState(useActivitiesStore.getInitialState(), true); // "restart"

    await store().loadHistory(services);

    expect(store().history).toBe('ready');
    expect(shownIds()).toEqual(['2', '1']);
    expect(store().uploads.map((u) => u.fileName)).toEqual(['export.zip']);
    expect(store().dataset?.segmentIndex.activitySegments.size).toBe(2);
    expect(store().status).toEqual({ stage: 'idle' }); // uploads stay possible meanwhile
  });

  it('a slower startup load never overwrites the history an upload has just loaded', async () => {
    fake.queueArchive(rides('1'));
    let finishStartupRead: () => void = () => {};
    const slowStartup: RideHistoryServices = {
      ...services,
      client: {
        ...services.client,
        // The startup load read the (still empty) history before the upload was stored.
        listUploads: async () => {
          await new Promise<void>((resolve) => (finishStartupRead = resolve));
          return [];
        },
        fetchRides: async () => new Uint8Array(1),
      },
      restoreHistory: async () => ({
        activities: [],
        segmentIndex: buildSegmentIndex([]),
        skippedCount: 0,
      }),
    };

    const startup = store().loadHistory(slowStartup);
    await store().loadArchive(zipFile('export.zip'), services);
    finishStartupRead();
    await startup;

    expect(shownIds()).toEqual(['1']);
    expect(store().history).toBe('ready');
  });

  it('shows no dataset for an empty history', async () => {
    await store().loadHistory(services);

    expect(store().history).toBe('ready');
    expect(store().dataset).toBeNull();
  });

  it('reports the history as unavailable when the storage cannot be reached', async () => {
    fake.setAvailable(false);

    await store().loadHistory(services);

    expect(store().history).toBe('unavailable');
    expect(store().dataset).toBeNull();
  });
});

describe('BR-16 / BR-18: cumulative uploads', () => {
  it('BR-01: stores and shows the rides of an upload', async () => {
    fake.queueArchive({ ...rides('1', '2'), excludedNonRideCount: 4 });

    const outcome = await store().loadArchive(zipFile('export.zip'), services);

    expect(outcome).toMatchObject({ ok: true, upload: { fileName: 'export.zip', rideCount: 2 } });
    expect(shownIds()).toEqual(['2', '1']);
    expect(fake.storedIds()).toEqual(['1', '2']);
    expect(store().status).toEqual({ stage: 'done' });
    expect(store().pendingFileName).toBeNull();
    expect(store().lastUpload?.upload).toMatchObject({ newRideCount: 2, excludedNonRideCount: 4 });
  });

  it('AC-15 / AC-35: another export adds its rides and keeps the stored ones', async () => {
    fake.queueArchive(rides('1', '2'), rides('3'));

    await store().loadArchive(zipFile('first.zip'), services);
    await store().loadArchive(zipFile('second.zip'), services);

    expect(shownIds()).toEqual(['3', '2', '1']);
    expect(store().uploads.map((u) => u.fileName)).toEqual(['second.zip', 'first.zip']);
    expect(store().lastUpload?.upload.fileName).toBe('second.zip');
  });

  it('AC-18: a ride in several uploads is shown once', async () => {
    fake.queueArchive(rides('1', '2'), rides('2', '3'));

    await store().loadArchive(zipFile('older.zip'), services);
    await store().loadArchive(zipFile('newer.zip'), services);

    expect(shownIds()).toEqual(['3', '2', '1']);
    expect(store().lastUpload?.upload).toMatchObject({ rideCount: 2, newRideCount: 1 });
  });

  it('UX-02: exposes progress while processing, saving and loading', async () => {
    const seen: string[] = [];
    const unsubscribe = useActivitiesStore.subscribe((state) => seen.push(state.status.stage));
    fake.queueArchive(rides('1'));
    const release = fake.holdNextImport({ stage: 'parsing-activities', processed: 1, total: 2 });

    const upload = store().loadArchive(zipFile('export.zip'), services);
    release();
    await upload;
    unsubscribe();

    expect([...new Set(seen)]).toEqual([
      'reading-archive',
      'parsing-activities',
      'saving',
      'loading-history',
      'indexing',
      'done',
    ]);
  });
});

describe('BR-37: duplicate file', () => {
  it('AC-41: refuses a file already imported, names the earlier upload, changes nothing', async () => {
    fake.queueArchive(rides('1'), { ...rides('2'), fileHash: 'hash:first.zip' });
    await store().loadArchive(zipFile('first.zip'), services);

    const outcome = await store().loadArchive(zipFile('renamed.zip'), services);

    expect(outcome).toEqual({ ok: false, reason: 'duplicate-file' });
    expect(store().status).toEqual({ stage: 'failed', reason: 'duplicate-file' });
    expect(store().duplicateOf?.fileName).toBe('first.zip');
    expect(store().pendingFileName).toBe('renamed.zip');
    expect(shownIds()).toEqual(['1']);
    expect(fake.storedIds()).toEqual(['1']);
  });

  it('clears the duplicate warning when the next upload starts', async () => {
    fake.queueArchive(rides('1'), rides('1'), rides('2'));
    await store().loadArchive(zipFile('a.zip'), services);
    await store().loadArchive(zipFile('a.zip'), services);
    expect(store().duplicateOf).not.toBeNull();

    await store().loadArchive(zipFile('b.zip'), services);

    expect(store().duplicateOf).toBeNull();
  });
});

describe('BRD §10: failures store and change nothing', () => {
  it('AC-16: a failed import reports the reason and keeps the stored rides', async () => {
    fake.queueArchive(rides('1'), { fail: 'not-a-zip' });
    await store().loadArchive(zipFile('good.zip'), services);

    const outcome = await store().loadArchive(zipFile('bad.zip'), services);

    expect(outcome).toEqual({ ok: false, reason: 'not-a-zip' });
    expect(store().status).toEqual({ stage: 'failed', reason: 'not-a-zip' });
    expect(store().pendingFileName).toBe('bad.zip');
    expect(shownIds()).toEqual(['1']);
  });

  it('refuses an upload when the ride storage is unavailable (no in-memory fallback)', async () => {
    fake.queueArchive(rides('1'));
    fake.setAvailable(false);

    const outcome = await store().loadArchive(zipFile('export.zip'), services);

    expect(outcome).toEqual({ ok: false, reason: 'history-unavailable' });
    expect(store().dataset).toBeNull();
  });

  it('treats an unexpected importer crash as an unreadable archive', async () => {
    const crashing: RideHistoryServices = {
      ...services,
      importArchive: async () => {
        throw new Error('worker died');
      },
    };

    const outcome = await store().loadArchive(zipFile('x.zip'), crashing);

    expect(outcome).toEqual({ ok: false, reason: 'corrupt-archive' });
    expect(fake.services.client.createUpload).not.toHaveBeenCalled();
  });

  it('reports a failed save', async () => {
    fake.queueArchive(rides('1'));
    const failing: RideHistoryServices = {
      ...services,
      client: {
        ...services.client,
        createUpload: async () => {
          throw new Error('disk full');
        },
      },
    };

    expect(await store().loadArchive(zipFile('x.zip'), failing)).toEqual({
      ok: false,
      reason: 'save-failed',
    });
  });

  it('ignores the result of an import superseded by a newer one', async () => {
    fake.queueArchive(rides('1'), rides('2'));
    const release = fake.holdNextImport();

    const slow = store().loadArchive(zipFile('slow.zip'), services);
    const fast = store().loadArchive(zipFile('fast.zip'), services);
    release();

    expect(await slow).toBeNull();
    expect(await fast).toMatchObject({ ok: true });
    expect(store().lastUpload?.upload.fileName).toBe('fast.zip');
  });
});

describe('BR-17 / AC-17: files are checked before the import starts', () => {
  it('rejects a non-ZIP file without running the importer, and keeps the rides', async () => {
    fake.queueArchive(rides('1'));
    await store().loadArchive(zipFile('export.zip'), services);

    const outcome = await store().loadArchive(
      new File(['x'], 'notes.txt', { type: 'text/plain' }),
      services,
    );

    expect(outcome).toEqual({ ok: false, reason: 'not-a-zip' });
    expect(fake.services.importArchive).toHaveBeenCalledTimes(1);
    expect(store().status).toEqual({ stage: 'failed', reason: 'not-a-zip' });
    expect(shownIds()).toEqual(['1']);
  });

  it('rejects a file over the size limit without running the importer', async () => {
    const huge = zipFile('huge.zip');
    Object.defineProperty(huge, 'size', { value: 6 * 1024 ** 3 });

    const outcome = await store().loadArchive(huge, services);

    expect(outcome).toEqual({ ok: false, reason: 'too-large' });
    expect(fake.services.importArchive).not.toHaveBeenCalled();
    expect(store().pendingFileName).toBe('huge.zip');
  });
});

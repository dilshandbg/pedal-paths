import { beforeEach, describe, expect, it } from 'vitest';
import { useActivitiesStore } from '@/features/activities/store/activitiesStore';
import type { ArchiveImporter } from '@/features/activities/workers/runImportInWorker';
import type { CyclingActivity, ImportResult } from '@/types';

const activity = (activityId: string): CyclingActivity => ({
  activityId,
  activityName: `Ride ${activityId}`,
  activityDate: '2024-01-01T08:00:00.000Z',
  year: 2024,
  month: 1,
  distanceKm: 10,
  elevationGainM: 100,
  gpsTrack: [],
});

const success = (...ids: string[]): ImportResult => ({
  ok: true,
  activities: ids.map(activity),
  issues: [],
  excludedNonRideCount: 0,
});

const importerReturning =
  (result: ImportResult): ArchiveImporter =>
  async () =>
    result;

const zipFile = (name: string) => new File(['zip'], name, { type: 'application/zip' });

describe('useActivitiesStore', () => {
  beforeEach(() => {
    useActivitiesStore.setState(useActivitiesStore.getInitialState(), true);
  });

  it('starts idle with no dataset', () => {
    const state = useActivitiesStore.getState();
    expect(state.dataset).toBeNull();
    expect(state.status).toEqual({ stage: 'idle' });
  });

  it('BR-01: stores the activities of a successful import', async () => {
    await useActivitiesStore
      .getState()
      .loadArchive(zipFile('export.zip'), importerReturning(success('a', 'b')));

    const { dataset, status, pendingFileName } = useActivitiesStore.getState();
    expect(dataset?.fileName).toBe('export.zip');
    expect(dataset?.activities.map((a) => a.activityId)).toEqual(['a', 'b']);
    expect(status).toEqual({ stage: 'done' });
    expect(pendingFileName).toBeNull();
  });

  it('UX-02: exposes progress reported by the importer', async () => {
    const seen: string[] = [];
    const unsubscribe = useActivitiesStore.subscribe((state) => seen.push(state.status.stage));
    const importer: ArchiveImporter = async (_file, onStatus) => {
      onStatus({ stage: 'parsing-activities', processed: 1, total: 2 });
      return success('a');
    };

    await useActivitiesStore.getState().loadArchive(zipFile('export.zip'), importer);
    unsubscribe();

    expect(seen).toEqual(['reading-archive', 'parsing-activities', 'done']);
  });

  it('AC-15: a new ZIP replaces the existing dataset', async () => {
    const { loadArchive } = useActivitiesStore.getState();
    await loadArchive(zipFile('old.zip'), importerReturning(success('old-1', 'old-2')));
    await loadArchive(zipFile('new.zip'), importerReturning(success('new-1')));

    const { dataset } = useActivitiesStore.getState();
    expect(dataset?.fileName).toBe('new.zip');
    expect(dataset?.activities.map((a) => a.activityId)).toEqual(['new-1']);
  });

  it('AC-16: a failed import reports the reason and keeps the previous dataset', async () => {
    const { loadArchive } = useActivitiesStore.getState();
    await loadArchive(zipFile('good.zip'), importerReturning(success('a')));
    await loadArchive(zipFile('bad.zip'), importerReturning({ ok: false, reason: 'not-a-zip' }));

    const state = useActivitiesStore.getState();
    expect(state.status).toEqual({ stage: 'failed', reason: 'not-a-zip' });
    expect(state.pendingFileName).toBe('bad.zip');
    expect(state.dataset?.fileName).toBe('good.zip');
  });

  it('treats an unexpected importer crash as an unreadable archive', async () => {
    const crashing: ArchiveImporter = async () => {
      throw new Error('worker died');
    };

    const result = await useActivitiesStore.getState().loadArchive(zipFile('x.zip'), crashing);

    expect(result).toEqual({ ok: false, reason: 'corrupt-archive' });
    expect(useActivitiesStore.getState().status).toEqual({
      stage: 'failed',
      reason: 'corrupt-archive',
    });
  });

  it('ignores the result of an import superseded by a newer one', async () => {
    let finishSlow: (result: ImportResult) => void = () => {};
    const slow: ArchiveImporter = () =>
      new Promise((resolve) => {
        finishSlow = resolve;
      });
    const { loadArchive } = useActivitiesStore.getState();

    const slowImport = loadArchive(zipFile('slow.zip'), slow);
    await loadArchive(zipFile('fast.zip'), importerReturning(success('fast')));
    finishSlow(success('slow'));

    expect(await slowImport).toBeNull();
    expect(useActivitiesStore.getState().dataset?.fileName).toBe('fast.zip');
  });
});

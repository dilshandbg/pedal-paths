import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSegmentsStore } from '@/features/segments/store/segmentsStore';
import type { SegmentFileParser } from '@/features/segments/workers/runSegmentParseInWorker';
import { SegmentApiError, type SegmentsClient } from '@/services/segments-api/segmentsClient';
import type { SegmentImportPlan } from '@/types';
import { segmentRecord } from './fixtures';
import { segmentDetail, storedSegment } from './storedFixtures';

const plan: SegmentImportPlan = {
  items: [
    {
      segmentId: '1001',
      name: 'Test Hill',
      distanceM: 1500,
      elevationGainM: 80,
      status: 'new',
      changedFields: [],
      newEffortCount: 0,
    },
  ],
  counts: { new: 1, update: 0, unchanged: 0 },
  newEffortCount: 0,
};
const payload = { sourceFile: 'segments.json', segments: [segmentRecord()], efforts: [] };

function fakeClient(overrides: Partial<SegmentsClient> = {}): SegmentsClient {
  return {
    list: vi.fn(async () => [storedSegment()]),
    get: vi.fn(async () => segmentDetail()),
    preview: vi.fn(async () => plan),
    import: vi.fn(async () => plan),
    remove: vi.fn(async () => undefined),
    removeAll: vi.fn(async () => undefined),
    ...overrides,
  };
}

const okParser: SegmentFileParser = async () => ({ ok: true as const, payload });
const file = (name = 'segments.json', size = 10) => {
  const f = new File(['{}'], name);
  Object.defineProperty(f, 'size', { value: size });
  return f;
};
const state = () => useSegmentsStore.getState();

beforeEach(() => {
  useSegmentsStore.setState(useSegmentsStore.getInitialState(), true);
});

describe('BR-23: loading stored segments', () => {
  it('loads the stored segments', async () => {
    await state().loadSegments(fakeClient());
    expect(state().storage).toBe('ready');
    expect(state().segments.map((s) => s.segmentId)).toEqual(['1001']);
  });

  it('reports storage as unavailable when the backend cannot be reached', async () => {
    await state().loadSegments(
      fakeClient({
        list: vi.fn(async () => Promise.reject(new SegmentApiError('storage-unavailable'))),
      }),
    );
    expect(state().storage).toBe('unavailable');
    expect(state().segments).toEqual([]);
  });
});

describe('BR-20 – BR-22: choosing a file', () => {
  it('AC-22: parses, previews and waits for review without storing', async () => {
    const client = fakeClient();
    await state().chooseFile(file(), okParser, client);
    expect(state().importState).toEqual({
      stage: 'review',
      fileName: 'segments.json',
      payload,
      plan,
    });
    expect(client.preview).toHaveBeenCalledWith(payload);
    expect(client.import).not.toHaveBeenCalled();
  });

  it('passes the stored segment IDs to the parser (efforts CSV)', async () => {
    useSegmentsStore.setState({ segments: [storedSegment({ segmentId: '42' })] });
    const parser = vi.fn(okParser);
    await state().chooseFile(file('efforts.csv'), parser, fakeClient());
    expect(parser).toHaveBeenCalledWith(expect.any(File), ['42']);
  });

  it('AC-21: rejects an unsupported or oversized file before reading it', async () => {
    const parser = vi.fn(okParser);
    await state().chooseFile(file('notes.txt'), parser, fakeClient());
    expect(state().importState).toMatchObject({
      stage: 'invalid',
      problems: [{ location: 'file', message: expect.stringMatching(/Unsupported/) }],
    });
    await state().chooseFile(file('big.json', 21 * 1024 * 1024), parser, fakeClient());
    expect(state().importState).toMatchObject({
      stage: 'invalid',
      problems: [{ message: 'The file is larger than 20 MB.' }],
    });
    expect(parser).not.toHaveBeenCalled();
  });

  it('AC-21: shows the problems of an invalid file', async () => {
    const problems = [{ location: 'row 2', field: 'name', message: 'Is required.' }];
    const client = fakeClient();
    await state().chooseFile(
      file('s.csv'),
      vi.fn(async () => ({ ok: false as const, problems })),
      client,
    );
    expect(state().importState).toEqual({ stage: 'invalid', fileName: 's.csv', problems });
    expect(client.preview).not.toHaveBeenCalled();
  });

  it('shows problems the backend found', async () => {
    const problems = [{ location: 'segment 1', field: 'distanceM', message: 'Bad.' }];
    await state().chooseFile(
      file(),
      okParser,
      fakeClient({
        preview: vi.fn(async () =>
          Promise.reject(new SegmentApiError('invalid-payload', problems)),
        ),
      }),
    );
    expect(state().importState).toMatchObject({ stage: 'invalid', problems });
  });

  it('fails clearly when storage is unavailable or the file is unreadable', async () => {
    await state().chooseFile(
      file(),
      okParser,
      fakeClient({
        preview: vi.fn(async () => Promise.reject(new SegmentApiError('storage-unavailable'))),
      }),
    );
    expect(state().importState).toMatchObject({
      stage: 'failed',
      message: expect.stringMatching(/not available/),
    });

    await state().chooseFile(
      file(),
      vi.fn(async () => Promise.reject(new Error('boom'))),
      fakeClient(),
    );
    expect(state().importState).toMatchObject({
      stage: 'failed',
      message: 'The file could not be read.',
    });
  });

  it('AC-22: cancelling the review stores nothing', async () => {
    const client = fakeClient();
    await state().chooseFile(file(), okParser, client);
    state().cancelImport();
    expect(state().importState).toEqual({ stage: 'idle' });
    await state().confirmImport(client);
    expect(client.import).not.toHaveBeenCalled();
  });

  it('discards a file that is still being read when cancelled', async () => {
    let resolveParse: (value: Awaited<ReturnType<SegmentFileParser>>) => void = () => {};
    const slow: SegmentFileParser = () => new Promise((resolve) => (resolveParse = resolve));
    const pending = state().chooseFile(file(), slow, fakeClient());
    expect(state().importState).toEqual({ stage: 'reading', fileName: 'segments.json' });
    state().cancelImport();
    resolveParse({ ok: true, payload });
    await pending;
    expect(state().importState).toEqual({ stage: 'idle' });
  });
});

describe('BR-23 / BR-24: confirming an import', () => {
  it('stores the reviewed payload and refreshes the list', async () => {
    const client = fakeClient();
    await state().chooseFile(file(), okParser, client);
    await state().confirmImport(client);
    expect(client.import).toHaveBeenCalledWith(payload);
    expect(state().importState).toEqual({ stage: 'done', fileName: 'segments.json', plan });
    expect(state().segments).toHaveLength(1);
  });

  it('reloads the open segment detail after an update', async () => {
    const client = fakeClient();
    await state().selectSegment('1001', client);
    await state().chooseFile(file(), okParser, client);
    await state().confirmImport(client);
    expect(client.get).toHaveBeenCalledTimes(2);
  });

  it('keeps the review data out of the store on failure and reports it', async () => {
    const client = fakeClient({
      import: vi.fn(async () => Promise.reject(new SegmentApiError('storage-error'))),
    });
    await state().chooseFile(file(), okParser, client);
    await state().confirmImport(client);
    expect(state().importState).toMatchObject({ stage: 'failed', message: expect.any(String) });
    expect(client.list).not.toHaveBeenCalled();
  });
});

describe('BR-25: selecting a segment', () => {
  it('loads and clears the detail', async () => {
    const client = fakeClient();
    await state().selectSegment('1001', client);
    expect(state()).toMatchObject({ selectedSegmentId: '1001', detailStatus: 'ready' });
    expect(state().detail?.efforts).toHaveLength(2);

    await state().selectSegment(null, client);
    expect(state()).toMatchObject({ selectedSegmentId: null, detail: null, detailStatus: 'idle' });
  });

  it('reports a detail that cannot be loaded', async () => {
    await state().selectSegment(
      '1',
      fakeClient({ get: vi.fn(async () => Promise.reject(new SegmentApiError('not-found'))) }),
    );
    expect(state().detailStatus).toBe('failed');
  });
});

describe('BR-27 / AC-28: removing segment data', () => {
  it('removes the selected segment, closes its detail and refreshes the list', async () => {
    const client = fakeClient({ list: vi.fn(async () => []) });
    await state().selectSegment('1001', client);
    await state().removeSegment('1001', client);
    expect(client.remove).toHaveBeenCalledWith('1001');
    expect(state()).toMatchObject({ selectedSegmentId: null, detail: null, segments: [] });
  });

  it('treats a segment that is already gone as removed', async () => {
    const client = fakeClient({
      remove: vi.fn(async () => Promise.reject(new SegmentApiError('not-found'))),
      list: vi.fn(async () => []),
    });
    await state().removeSegment('1001', client);
    expect(state().actionError).toBeNull();
    expect(client.list).toHaveBeenCalled();
  });

  it('reports a failed removal and keeps the list', async () => {
    useSegmentsStore.setState({ segments: [storedSegment()] });
    await state().removeAllSegments(
      fakeClient({
        removeAll: vi.fn(async () => Promise.reject(new SegmentApiError('storage-error'))),
      }),
    );
    expect(state().actionError).toMatch(/failed/);
    expect(state().segments).toHaveLength(1);
  });

  it('removes all segment data', async () => {
    const client = fakeClient({ list: vi.fn(async () => []) });
    await state().selectSegment('1001', client);
    await state().removeAllSegments(client);
    expect(client.removeAll).toHaveBeenCalled();
    expect(state()).toMatchObject({ segments: [], selectedSegmentId: null });
  });
});

describe('BR-26: map visibility', () => {
  it('shows segments on the map by default and can hide them', () => {
    expect(state().showOnMap).toBe(true);
    state().setShowOnMap(false);
    expect(state().showOnMap).toBe(false);
  });
});

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/app/App';
import { useActivitiesStore } from '@/features/activities/store/activitiesStore';
import { useFilterStore } from '@/features/filters/store/filterStore';
import { parseSegmentFile } from '@/features/segments/services/parseSegmentFile';
import { planSegmentImport } from '@/features/segments/services/planSegmentImport';
import { effortKey, mergeSegment, personalBest } from '@/features/segments/services/segmentRules';
import { validateSegmentPayload } from '@/features/segments/services/validateSegmentPayload';
import { useSegmentsStore } from '@/features/segments/store/segmentsStore';
import type { SegmentEffortRecord, SegmentRecord, StoredSegment } from '@/types';
import { FakeMapboxOverlay } from '../mocks/mapLibraries';

// jsdom has no Web Workers (nor Blob.text): parse in the test thread with the real parser.
vi.mock('@/features/segments/workers/runSegmentParseInWorker', () => ({
  runSegmentParseInWorker: async (file: File, ids: readonly string[]) => {
    const text = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
    return parseSegmentFile(file.name, text, new Set(ids));
  },
}));

/**
 * In-memory stand-in for the local segment API, built on the same pure services as the real
 * backend (tested separately against SQLite in tests/server).
 */
function installFakeBackend() {
  const records = new Map<string, SegmentRecord>();
  const efforts = new Map<string, SegmentEffortRecord[]>();
  const requestedUrls: string[] = [];

  const stored = (record: SegmentRecord): StoredSegment => {
    const list = efforts.get(record.segmentId) ?? [];
    return {
      ...record,
      sourceFile: 'test',
      importedAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      storedEffortCount: list.length,
      personalBest: personalBest(record, list),
    };
  };
  const state = () =>
    new Map(
      [...records].map(([id, record]) => [
        id,
        { record, effortKeys: new Set((efforts.get(id) ?? []).map(effortKey)) },
      ]),
    );
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    requestedUrls.push(url);
    const method = init.method ?? 'GET';
    if (url === '/api/segments' && method === 'GET') {
      const list = [...records.values()].map(stored);
      return json({ segments: list.sort((a, b) => a.name.localeCompare(b.name)) });
    }
    if (url === '/api/segments' && method === 'DELETE') {
      records.clear();
      efforts.clear();
      return new Response(null, { status: 204 });
    }
    if (url === '/api/segments/preview' || url === '/api/segments/import') {
      const validation = validateSegmentPayload(
        JSON.parse(String(init.body)),
        new Set(records.keys()),
      );
      if (!validation.ok)
        return json({ error: { code: 'invalid-payload', problems: validation.problems } }, 400);
      const plan = planSegmentImport(state(), validation.payload);
      if (url.endsWith('/import')) {
        for (const segment of validation.payload.segments) {
          records.set(
            segment.segmentId,
            mergeSegment(records.get(segment.segmentId) ?? null, segment),
          );
        }
        for (const effort of validation.payload.efforts) {
          const list = efforts.get(effort.segmentId) ?? [];
          if (!list.some((known) => effortKey(known) === effortKey(effort))) list.push(effort);
          efforts.set(effort.segmentId, list);
        }
      }
      return json({ plan });
    }
    const id = /^\/api\/segments\/(\d+)$/.exec(url)?.[1];
    const record = id ? records.get(id) : undefined;
    if (!id || !record) return json({ error: { code: 'not-found' } }, 404);
    if (method === 'DELETE') {
      records.delete(id);
      efforts.delete(id);
      return new Response(null, { status: 204 });
    }
    const list = [...(efforts.get(id) ?? [])].sort((a, b) => a.elapsedTimeS - b.elapsedTimeS);
    return json({
      segment: {
        ...stored(record),
        efforts: list.map((effort, index) => ({ ...effort, isPersonalBest: index === 0 })),
      },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { records, requestedUrls };
}

/* SYNTHETIC segment files. Not real Strava data. */
const segmentsJson = (hillName = 'Hawk Hill', extraEffort = false) =>
  JSON.stringify({
    segments: [
      {
        id: 229781,
        name: hillName,
        distance: 2684.8,
        total_elevation_gain: 155.7,
        start_latlng: [37.8331, -122.4834],
        end_latlng: [37.8281, -122.4981],
        efforts: [
          { id: 1, start_date: '2024-06-01T07:12:00Z', elapsed_time: 560 },
          { id: 2, start_date: '2023-05-14T06:40:10Z', elapsed_time: 553 },
          ...(extraEffort
            ? [{ id: 3, start_date: '2025-03-01T07:00:00Z', elapsed_time: 540 }]
            : []),
        ],
      },
      { id: 42, name: 'Bridge Sprint', distance: 400, total_elevation_gain: 3 },
    ],
  });

const file = (content: string, name = 'segments.json') =>
  new File([content], name, { type: 'application/json' });

async function openSegmentsTab(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('tab', { name: 'Segments' }));
  return screen.getByRole('region', { name: 'Segments' });
}
const segmentFileInput = () => screen.getByLabelText('Segment file (JSON, GeoJSON or CSV)');
const segmentList = () => screen.getByRole('list', { name: 'Segments' });
const listedNames = () =>
  within(segmentList())
    .getAllByRole('button')
    .map((button) => button.firstChild?.textContent);

async function importFile(user: ReturnType<typeof userEvent.setup>, content: string) {
  await user.upload(segmentFileInput(), file(content));
  const review = await screen.findByRole('region', { name: 'Import review' });
  await user.click(within(review).getByRole('button', { name: 'Confirm import' }));
  await screen.findByText(/^segments\.json: /);
}

beforeEach(() => {
  useActivitiesStore.setState(useActivitiesStore.getInitialState(), true);
  useFilterStore.setState(useFilterStore.getInitialState(), true);
  useSegmentsStore.setState(useSegmentsStore.getInitialState(), true);
});

describe('BR-20 – BR-27: segments from the UI', () => {
  it('AC-20: offers a dedicated Segments section with a segment file upload', async () => {
    installFakeBackend();
    const user = userEvent.setup();
    render(<App />);
    const section = await openSegmentsTab(user);
    expect(segmentFileInput()).toHaveAttribute('accept', expect.stringContaining('.geojson'));
    expect(await within(section).findByText('No segments imported yet.')).toBeInTheDocument();
  });

  it('AC-21: rejects an invalid file, naming the record and field, and stores nothing', async () => {
    const backend = installFakeBackend();
    const user = userEvent.setup();
    render(<App />);
    await openSegmentsTab(user);

    await user.upload(
      segmentFileInput(),
      file(JSON.stringify([{ id: 7, name: 'Bad', distance: -5 }])),
    );
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('segments.json was not imported. Nothing was stored.');
    expect(alert).toHaveTextContent('segment 1 (ID 7), distance');
    expect(backend.records.size).toBe(0);

    await user.click(within(alert).getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('AC-22: shows the review and stores nothing when cancelled', async () => {
    const backend = installFakeBackend();
    const user = userEvent.setup();
    render(<App />);
    await openSegmentsTab(user);

    await user.upload(segmentFileInput(), file(segmentsJson()));
    const review = await screen.findByRole('region', { name: 'Import review' });
    expect(review).toHaveTextContent('2 new, 0 updates, 0 unchanged · 2 new efforts');
    const rows = within(review).getAllByRole('row').slice(1);
    expect(rows[0]).toHaveTextContent('Hawk Hill');
    expect(rows[0]).toHaveTextContent('ID 229781 · 2.7 km · 156 m gain');
    expect(rows[0]).toHaveTextContent('New');

    await user.click(within(review).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('region', { name: 'Import review' })).not.toBeInTheDocument();
    expect(backend.records.size).toBe(0);
  });

  it('AC-23 – AC-26: imports, browses and inspects segments', async () => {
    installFakeBackend();
    const user = userEvent.setup();
    render(<App />);
    await openSegmentsTab(user);
    await importFile(user, segmentsJson());

    expect(screen.getByText(/Added 2 segments, stored 2 new efforts\./)).toBeInTheDocument();
    expect(listedNames()).toEqual(['Bridge Sprint', 'Hawk Hill']);

    // AC-25: search, distance range and sort.
    await user.type(screen.getByLabelText('Search by name'), 'hawk');
    expect(listedNames()).toEqual(['Hawk Hill']);
    await user.clear(screen.getByLabelText('Search by name'));
    await user.type(screen.getByLabelText('Minimum distance (km)'), '1');
    expect(listedNames()).toEqual(['Hawk Hill']);
    await user.clear(screen.getByLabelText('Minimum distance (km)'));
    await user.selectOptions(screen.getByLabelText('Sort by'), 'Distance (longest first)');
    expect(listedNames()).toEqual(['Hawk Hill', 'Bridge Sprint']);

    // AC-26: details with the effort history and the personal best identified.
    await user.click(within(segmentList()).getByRole('button', { name: /Hawk Hill/ }));
    const details = await screen.findByRole('region', { name: 'Segment details' });
    expect(await within(details).findByRole('heading', { name: 'Hawk Hill' })).toBeInTheDocument();
    expect(details).toHaveTextContent('Personal best9:13 on May 14, 2023');
    const efforts = within(details).getAllByRole('row').slice(1);
    expect(efforts).toHaveLength(2);
    expect(efforts[0]).toHaveTextContent('★ Personal best');
    expect(efforts[1]).not.toHaveTextContent('Personal best');

    await user.click(within(details).getByRole('button', { name: '← Back to segments' }));
    expect(segmentList()).toBeInTheDocument();
  });

  it('AC-24: re-importing updates segments without duplicates', async () => {
    installFakeBackend();
    const user = userEvent.setup();
    render(<App />);
    await openSegmentsTab(user);
    await importFile(user, segmentsJson());

    await user.upload(segmentFileInput(), file(segmentsJson('Hawk Hill Climb', true)));
    const review = await screen.findByRole('region', { name: 'Import review' });
    expect(review).toHaveTextContent('0 new, 1 update, 1 unchanged · 1 new effort');
    expect(review).toHaveTextContent('Changes: name · 1 new effort');
    await user.click(within(review).getByRole('button', { name: 'Confirm import' }));
    await screen.findByText(/Updated 1 segment, stored 1 new effort\./);

    expect(listedNames()).toEqual(['Bridge Sprint', 'Hawk Hill Climb']);
    expect(
      within(segmentList()).getByRole('button', { name: /Hawk Hill Climb/ }),
    ).toHaveTextContent('PB 9:00');
  });

  it('AC-28: removes one segment, then all segment data, after confirming', async () => {
    const backend = installFakeBackend();
    const user = userEvent.setup();
    render(<App />);
    await openSegmentsTab(user);
    await importFile(user, segmentsJson());

    await user.click(within(segmentList()).getByRole('button', { name: /Bridge Sprint/ }));
    const details = await screen.findByRole('region', { name: 'Segment details' });
    await user.click(await within(details).findByRole('button', { name: 'Remove segment' }));
    await user.click(within(details).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(listedNames()).toEqual(['Hawk Hill']));
    expect(backend.records.has('42')).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Remove all segment data' }));
    const confirm = screen.getByRole('group', { name: /Remove all 1 segments/ });
    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }));
    expect(backend.records.size).toBe(1);

    await user.click(screen.getByRole('button', { name: 'Remove all segment data' }));
    await user.click(screen.getByRole('button', { name: 'Remove all' }));
    expect(await screen.findByText('No segments imported yet.')).toBeInTheDocument();
    expect(backend.records.size).toBe(0);
  });

  it('AC-27: draws stored segments on the map and opens one when clicked', async () => {
    installFakeBackend();
    const user = userEvent.setup();
    render(<App />);
    await openSegmentsTab(user);
    await importFile(user, segmentsJson());
    await user.click(screen.getByRole('tab', { name: 'Rides' }));

    type Layer = { id: string; props: { data: unknown; onClick?: (info: unknown) => void } };
    const segmentLayer = async () => {
      let found: Layer | undefined;
      await waitFor(() => {
        const layers = (FakeMapboxOverlay.instances[0]?.props.layers ?? []) as Layer[];
        found = layers.find((layer) => layer.id === 'segment-overlay');
        expect(found).toBeDefined();
      });
      return found as Layer;
    };
    const layer = await segmentLayer();
    const paths = layer.props.data as { segmentId: string }[];
    // Bridge Sprint has no geometry, so only Hawk Hill is drawn.
    expect(paths.map((p) => p.segmentId)).toEqual(['229781']);

    layer.props.onClick?.({ object: paths[0] });
    expect(
      await screen.findByRole('tab', { name: 'Segments', selected: true }),
    ).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Hawk Hill' })).toBeInTheDocument();

    // Hiding segments removes the overlay.
    await user.click(screen.getByRole('checkbox', { name: 'Show segments on the map' }));
    await waitFor(() => {
      const layers = (FakeMapboxOverlay.instances[0]?.props.layers ?? []) as Layer[];
      expect(layers.some((entry) => entry.id === 'segment-overlay')).toBe(false);
    });
  });

  it('explains when segment storage is not available', async () => {
    // The default test fetch rejects, as when no backend is running.
    const user = userEvent.setup();
    render(<App />);
    const section = await openSegmentsTab(user);
    expect(await within(section).findByRole('alert')).toHaveTextContent(
      'Segment storage is not available.',
    );
    expect(segmentFileInput()).toBeDisabled();
  });

  it('AC-29 / BR-28: only ever calls the local segment API', async () => {
    const backend = installFakeBackend();
    const user = userEvent.setup();
    render(<App />);
    await openSegmentsTab(user);
    await importFile(user, segmentsJson());
    expect(backend.requestedUrls.length).toBeGreaterThan(0);
    for (const url of backend.requestedUrls) {
      expect(url).toMatch(/^\/api\/segments/);
      expect(url).not.toMatch(/strava/i);
    }
  });
});

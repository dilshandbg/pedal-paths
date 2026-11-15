// @vitest-environment node
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CatalogFileError, openCatalogRepository } from '../../../server/catalog/catalogRepository';
import { CATALOG_VERSION } from '../../../server/catalog/catalogFormat';
import { effort, payload, segment } from '../fixtures';
import { describeSegmentRepository } from '../segments/repositoryContract';

const T1 = new Date('2025-01-01T10:00:00.000Z');
const T2 = new Date('2025-02-01T10:00:00.000Z');

const SAMPLES = { altitudeSamplesM: [100, 112.5], distanceSamplesM: [0, 1500] };

let dir: string;
let file: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'catalog-'));
  file = join(dir, 'nested', 'segment-catalog.json');
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const readFile = () => JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;

describe('JSON segment catalog in memory', () => {
  describeSegmentRepository(() => openCatalogRepository(':memory:'));
});

describe('JSON segment catalog file', () => {
  describeSegmentRepository(() => openCatalogRepository(file));
});

describe('BR-23 / AC-23: the catalog file keeps segments across restarts', () => {
  it('saves every detail, route, sample and effort, and loads them again on start', () => {
    const first = openCatalogRepository(file);
    first.importPayload(payload([segment(SAMPLES)], [effort()]), T1);
    const listed = first.list();
    const detail = first.get('1001');
    first.close();

    const second = openCatalogRepository(file);
    expect(second.list()).toEqual(listed);
    expect(second.get('1001')).toEqual(detail);
    expect(second.get('1001')).toMatchObject({
      route: segment().route,
      elevationHighM: 180,
      ...SAMPLES,
    });
  });

  it('writes the documented format, one entry per segment ID (RULE-14)', () => {
    const repository = openCatalogRepository(file);
    repository.importPayload(payload([segment(SAMPLES), segment({ segmentId: '9' })]), T1);
    repository.importPayload(payload([segment({ name: 'Renamed' })], [effort()], 'b.json'), T2);

    const json = readFile();
    expect(Object.keys(json)).toEqual(['version', 'segments']);
    expect(json.version).toBe(CATALOG_VERSION);
    const segments = json.segments as Record<string, unknown>[];
    expect(segments.map((s) => s.id)).toEqual(['9', '1001']);
    expect(segments[1]).toEqual({
      id: '1001',
      name: 'Renamed',
      distanceKm: 1.5,
      elevationMinM: 100,
      elevationMaxM: 180,
      start: { lat: 10, lng: 20 },
      end: { lat: 10.01, lng: 20.01 },
      route: {
        latlng: [
          [10, 20],
          [10.01, 20.01],
        ],
        altitude: SAMPLES.altitudeSamplesM,
        distance: SAMPLES.distanceSamplesM,
      },
      elevationGainM: 80,
      averageGradePct: 5.3,
      maximumGradePct: 11,
      city: 'Testville',
      state: null,
      country: 'Nowhere',
      prElapsedTimeS: 320,
      prDate: '2024-01-01',
      effortCount: 2,
      sourceFile: 'b.json',
      importedAt: T1.toISOString(),
      updatedAt: T2.toISOString(),
      efforts: [
        {
          effortId: '5001',
          activityId: '9001',
          startDate: '2024-05-01T07:00:00.000Z',
          elapsedTimeS: 300,
          movingTimeS: 295,
        },
      ],
    });
  });

  it('starts empty without a file and creates it on the first change', () => {
    const repository = openCatalogRepository(file);
    expect(repository.list()).toEqual([]);
    expect(existsSync(file)).toBe(false);
    repository.importPayload(payload([segment()]), T1);
    expect(existsSync(file)).toBe(true);
  });

  it('BR-27: removing all data leaves an empty catalog file', () => {
    const repository = openCatalogRepository(file);
    repository.importPayload(payload([segment()]), T1);
    repository.removeAll();
    expect(readFile().segments).toEqual([]);
    expect(openCatalogRepository(file).list()).toEqual([]);
  });

  it('changes nothing when the file cannot be written', () => {
    const repository = openCatalogRepository(file);
    repository.importPayload(payload([segment()]), T1);
    rmSync(file);
    mkdirSync(file); // a folder where the file should be: the write fails
    expect(() => repository.importPayload(payload([segment({ segmentId: '2' })]), T2)).toThrow();
    expect(repository.list().map((s) => s.segmentId)).toEqual(['1001']);
    expect(() => repository.remove('1001')).toThrow();
    expect(repository.get('1001')).not.toBeNull();
  });
});

describe('BR-23: missing or malformed catalog data is handled gracefully', () => {
  const write = (content: string) => {
    mkdirSync(join(dir, 'nested'), { recursive: true });
    writeFileSync(file, content);
  };

  it.each([
    ['not JSON', '{ nope', /not valid JSON/],
    ['not a catalog', '[1, 2]', /Not a segment catalog/],
    ['a segments value that is not a list', '{"version":1,"segments":{}}', /must be a list/],
    ['a newer version', '{"version":99,"segments":[]}', /newer/],
  ])('refuses %s and leaves the file unchanged', (_, content, message) => {
    write(content);
    expect(() => openCatalogRepository(file)).toThrow(CatalogFileError);
    expect(() => openCatalogRepository(file)).toThrow(message);
    expect(readFileSync(file, 'utf8')).toBe(content);
  });

  it('loads the usable segments, warns about the rest, and keeps the original as a backup', () => {
    const original = JSON.stringify({
      version: 1,
      segments: [
        { id: '1', name: 'Good', distanceKm: 1.2 },
        { id: '1', name: 'Duplicate' },
        { name: 'No ID' },
        {
          id: 2,
          distanceKm: 'far',
          route: {
            latlng: [
              [1, 2],
              [1.1, 2.1],
            ],
            altitude: [5],
            distance: [0, 10],
          },
        },
      ],
    });
    write(original);
    const warnings: string[] = [];
    const repository = openCatalogRepository(file, (message) => warnings.push(message));

    expect(repository.list().map((s) => [s.segmentId, s.name, s.distanceM])).toEqual([
      ['1', 'Good', 1200],
      ['2', 'Segment 2', null],
    ]);
    expect(repository.get('2')).toMatchObject({
      route: [
        { latitude: 1, longitude: 2 },
        { latitude: 1.1, longitude: 2.1 },
      ],
      altitudeSamplesM: null,
      distanceSamplesM: [0, 10],
    });
    const log = warnings.join(' | ');
    expect(log).toContain('segment 2 (ID 1): skipped: the ID appears more than once');
    expect(log).toContain('segment 3: skipped: it has no valid "id"');
    expect(log).toContain('segment 4 (ID 2): "distanceKm" ignored');
    expect(log).toContain('"route.altitude" ignored: Must have one value per route point');
    expect(readFileSync(file, 'utf8')).toBe(original); // nothing written yet

    repository.remove('1');
    const backups = readdirSync(join(dir, 'nested')).filter((name) => name.endsWith('.bak'));
    expect(backups).toHaveLength(1);
    expect(readFileSync(join(dir, 'nested', backups[0] ?? ''), 'utf8')).toBe(original);
    expect(
      openCatalogRepository(file, () => undefined)
        .list()
        .map((s) => s.segmentId),
    ).toEqual(['2']);
  });

  it('writes no backup for a clean file', () => {
    openCatalogRepository(file).importPayload(payload([segment()]), T1);
    openCatalogRepository(file).remove('1001');
    expect(readdirSync(join(dir, 'nested')).some((name) => name.endsWith('.bak'))).toBe(false);
  });
});

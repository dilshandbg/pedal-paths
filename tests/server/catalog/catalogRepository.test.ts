// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CatalogFileError, openCatalogRepository } from '../../../server/catalog/catalogRepository';
import { CATALOG_FORMAT, CATALOG_VERSION } from '../../../server/catalog/catalogFormat';
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
    expect(json).toMatchObject({ format: CATALOG_FORMAT, version: CATALOG_VERSION });
    const segments = json.segments as Record<string, unknown>[];
    expect(segments.map((s) => s.segmentId)).toEqual(['9', '1001']);
    expect(segments[1]).toEqual({
      segmentId: '1001',
      name: 'Renamed',
      distanceM: 1500,
      elevationGainM: 80,
      averageGradePct: 5.3,
      maximumGradePct: 11,
      elevationHighM: 180,
      elevationLowM: 100,
      city: 'Testville',
      state: null,
      country: 'Nowhere',
      start: [10, 20],
      end: [10.01, 20.01],
      route: [
        [10, 20],
        [10.01, 20.01],
      ],
      ...SAMPLES,
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

describe('BR-23: a damaged catalog file is never loaded or overwritten', () => {
  const write = (content: string) => {
    mkdirSync(join(dir, 'nested'), { recursive: true });
    writeFileSync(file, content);
  };

  it.each([
    ['not JSON', '{ nope', /not valid JSON/],
    ['another file', '{"segments": []}', /Not a segment catalog/],
    ['a newer version', `{"format":"${CATALOG_FORMAT}","version":99,"segments":[]}`, /newer/],
  ])('refuses %s', (_, content, message) => {
    write(content);
    expect(() => openCatalogRepository(file)).toThrow(CatalogFileError);
    expect(() => openCatalogRepository(file)).toThrow(message);
    expect(readFileSync(file, 'utf8')).toBe(content);
  });

  it('refuses invalid segments and duplicate segment IDs, naming them', () => {
    const repository = openCatalogRepository(file);
    repository.importPayload(payload([segment()]), T1);
    const json = readFile();
    const [entry] = json.segments as Record<string, unknown>[];
    write(
      JSON.stringify({
        ...json,
        segments: [entry, entry, { ...entry, segmentId: '7', distanceM: -1 }],
      }),
    );

    expect(() => openCatalogRepository(file)).toThrow(
      /segment 2 \(ID 1001\) segmentId: Appears more than once.*segment 3 \(ID 7\) distanceM/,
    );
  });
});

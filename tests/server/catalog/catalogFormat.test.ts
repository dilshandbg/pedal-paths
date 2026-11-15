// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { type Catalog, readCatalog, serializeCatalog } from '../../../server/catalog/catalogFormat';
import { effort, segment } from '../fixtures';

const NOW = new Date('2026-11-15T10:00:00.000Z');

/** The owner's example catalog, verbatim (synthetic route values). */
const OWNER_EXAMPLE = {
  version: 1,
  segments: [
    {
      id: '35710081',
      name: 'Segment 35710081',
      distanceKm: 0.685,
      elevationMinM: 508.8,
      elevationMaxM: 527.8,
      start: { lat: 7.293365, lng: 80.633318 },
      end: { lat: 7.298987, lng: 80.635056 },
      route: {
        latlng: [
          [7.293365, 80.633318],
          [7.294, 80.6335],
        ],
        altitude: [508.8, 510.2],
        distance: [0, 15.5],
      },
    },
  ],
};

const read = (json: unknown) => {
  const result = readCatalog(json, NOW);
  if (!result.ok) throw new Error(result.error);
  return result;
};

describe('BR-23 / BR-29: readCatalog reads the documented catalog format', () => {
  it('reads the example without warnings, keeping coordinates and samples', () => {
    const { catalog, warnings } = read(OWNER_EXAMPLE);
    expect(warnings).toEqual([]);
    expect(catalog.get('35710081')).toEqual({
      record: {
        segmentId: '35710081',
        name: 'Segment 35710081',
        distanceM: 685,
        elevationGainM: null,
        averageGradePct: null,
        maximumGradePct: null,
        elevationHighM: 527.8,
        elevationLowM: 508.8,
        city: null,
        state: null,
        country: null,
        start: { latitude: 7.293365, longitude: 80.633318 },
        end: { latitude: 7.298987, longitude: 80.635056 },
        route: [
          { latitude: 7.293365, longitude: 80.633318 },
          { latitude: 7.294, longitude: 80.6335 },
        ],
        altitudeSamplesM: [508.8, 510.2],
        distanceSamplesM: [0, 15.5],
        prElapsedTimeS: null,
        prDate: null,
        effortCount: null,
      },
      sourceFile: null,
      importedAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
      efforts: [],
    });
  });

  it('writes the documented fields first, with the same values', () => {
    const json = JSON.parse(serializeCatalog(read(OWNER_EXAMPLE).catalog)) as {
      segments: Record<string, unknown>[];
    };
    const [entry] = json.segments;
    expect(Object.keys(entry ?? {}).slice(0, 8)).toEqual([
      'id',
      'name',
      'distanceKm',
      'elevationMinM',
      'elevationMaxM',
      'start',
      'end',
      'route',
    ]);
    expect(entry).toMatchObject(OWNER_EXAMPLE.segments[0] ?? {});
  });

  it('round-trips every stored value exactly, distances included', () => {
    const catalog: Catalog = new Map([
      [
        '1001',
        {
          record: { ...segment(), distanceM: 2684.82 },
          sourceFile: 'a.json',
          importedAt: NOW.toISOString(),
          updatedAt: NOW.toISOString(),
          efforts: [effort(), effort({ effortId: null, elapsedTimeS: 280 })],
        },
      ],
    ]);
    const again = read(JSON.parse(serializeCatalog(catalog)));
    expect(again.warnings).toEqual([]);
    expect(again.catalog.get('1001')?.record).toEqual(catalog.get('1001')?.record);
    expect(again.catalog.get('1001')?.efforts).toHaveLength(2);
  });

  it('writes an empty catalog', () => {
    expect(JSON.parse(serializeCatalog(new Map()))).toEqual({ version: 1, segments: [] });
  });
});

describe('BR-23: readCatalog handles missing or malformed data', () => {
  it('reads a missing version as 1, and missing segments as none, with a warning', () => {
    expect(read({}).warnings).toEqual(['No "version"; read as version 1.']);
    expect(read({}).catalog.size).toBe(0);
  });

  it('accepts numeric IDs and fills in a missing name', () => {
    const { catalog } = read({ version: 1, segments: [{ id: 42 }] });
    expect(catalog.get('42')?.record.name).toBe('Segment 42');
  });

  it('drops an invalid route together with the samples that belong to it', () => {
    const { catalog, warnings } = read({
      version: 1,
      segments: [
        {
          id: '5',
          route: {
            latlng: [
              [1, 2],
              [95, 2],
            ],
            altitude: [1, 2],
          },
        },
      ],
    });
    expect(catalog.get('5')?.record).toMatchObject({ route: null, altitudeSamplesM: null });
    expect(warnings.some((w) => w.includes('"route.latlng" ignored'))).toBe(true);
    expect(warnings.some((w) => w.includes('"route.altitude" ignored'))).toBe(true);
  });

  it('skips invalid and repeated efforts, and ignores bad dates', () => {
    const { catalog, warnings } = read({
      version: 1,
      segments: [
        {
          id: '5',
          importedAt: 'yesterday',
          efforts: [
            { startDate: '2024-05-01T07:00:00Z', elapsedTimeS: 300 },
            { startDate: '2024-05-01T07:00:00Z', elapsedTimeS: 300 },
            { startDate: 'soon', elapsedTimeS: 0 },
          ],
        },
      ],
    });
    expect(catalog.get('5')?.efforts).toHaveLength(1);
    expect(catalog.get('5')?.importedAt).toBe(NOW.toISOString());
    expect(warnings).toHaveLength(3);
  });

  it('refuses what is not a catalog', () => {
    expect(readCatalog('text').ok).toBe(false);
    expect(readCatalog({ version: '1', segments: [] }).ok).toBe(false);
    expect(readCatalog({ version: 1, segments: 'x' }).ok).toBe(false);
    expect(readCatalog({ version: 2, segments: [] }).ok).toBe(false);
  });
});

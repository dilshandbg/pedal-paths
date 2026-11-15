// @vitest-environment node
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openCatalogRepository } from '../../../server/catalog/catalogRepository';
import {
  migrateLegacyDatabase,
  MIGRATED_SUFFIX,
} from '../../../server/catalog/migrateLegacyDatabase';
import { openDatabase } from '../../../server/db/database';
import { createSegmentRepository } from '../../../server/segments/segmentRepository';
import { effort, payload, segment } from '../fixtures';

const T1 = new Date('2025-01-01T10:00:00.000Z');
const T2 = new Date('2025-02-01T10:00:00.000Z');

let dir: string;
let dbFile: string;
let catalogFile: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'migrate-'));
  dbFile = join(dir, 'segments.sqlite');
  catalogFile = join(dir, 'segment-catalog.json');
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** A legacy database with a full segment, an updated one and one without optional details. */
function seedLegacyDatabase() {
  const legacy = createSegmentRepository(openDatabase(dbFile));
  legacy.importPayload(
    payload(
      [
        segment(),
        segment({ segmentId: '2', name: 'Second', city: null }),
        segment({
          segmentId: '3',
          name: 'Bare',
          distanceM: null,
          elevationGainM: null,
          start: null,
          end: null,
          route: null,
          prElapsedTimeS: null,
          prDate: null,
        }),
      ],
      [effort(), effort({ effortId: null, elapsedTimeS: 280, movingTimeS: null })],
    ),
    T1,
  );
  legacy.importPayload(payload([segment({ segmentId: '2', name: 'Second v2' })], [], 'b.csv'), T2);
  const ids = legacy.list().map((s) => s.segmentId);
  const snapshot = { list: legacy.list(), details: ids.map((id) => legacy.get(id)) };
  legacy.close();
  return snapshot;
}

describe('BR-30: existing segments are migrated into the JSON catalog', () => {
  it('copies every segment with route, elevation, efforts and dates, without loss', () => {
    const before = seedLegacyDatabase();

    expect(migrateLegacyDatabase(dbFile, catalogFile)).toEqual({
      segments: 3,
      efforts: 2,
      backupPath: dbFile + MIGRATED_SUFFIX,
    });

    const catalog = openCatalogRepository(catalogFile);
    expect(catalog.list()).toEqual(before.list);
    expect(before.list.map((s) => catalog.get(s.segmentId))).toEqual(before.details);
    expect(catalog.get('1001')).toMatchObject({
      route: segment().route,
      elevationGainM: 80,
      elevationHighM: 180,
      elevationLowM: 100,
      altitudeSamplesM: null, // the database never had samples
    });
  });

  it('moves the database aside, so it is migrated only once', () => {
    seedLegacyDatabase();
    migrateLegacyDatabase(dbFile, catalogFile);
    expect(existsSync(dbFile)).toBe(false);
    expect(existsSync(dbFile + MIGRATED_SUFFIX)).toBe(true);
    expect(migrateLegacyDatabase(dbFile, catalogFile)).toBeNull();
  });

  it('never replaces an existing catalog', () => {
    seedLegacyDatabase();
    writeFileSync(catalogFile, '{"format":"segment-catalog","version":1,"segments":[]}');
    expect(migrateLegacyDatabase(dbFile, catalogFile)).toBeNull();
    expect(openCatalogRepository(catalogFile).list()).toEqual([]);
    expect(existsSync(dbFile)).toBe(true);
  });

  it('does nothing without a database, or for an in-memory catalog', () => {
    expect(migrateLegacyDatabase(dbFile, catalogFile)).toBeNull();
    expect(existsSync(catalogFile)).toBe(false);
    seedLegacyDatabase();
    expect(migrateLegacyDatabase(dbFile, ':memory:')).toBeNull();
    expect(existsSync(dbFile)).toBe(true);
  });
});

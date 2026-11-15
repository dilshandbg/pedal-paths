import { existsSync, renameSync, rmSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import type { SegmentRecord } from '../../src/types/segment';
import { effortKey, SEGMENT_FIELDS } from '../../src/features/segments/services/segmentRules';
import { openDatabase } from '../db/database';
import { createSegmentRepository } from '../segments/segmentRepository';
import type { Catalog, CatalogEntry } from './catalogFormat';
import { loadCatalogFile, saveCatalogFile } from './catalogRepository';

export interface LegacyMigration {
  readonly segments: number;
  readonly efforts: number;
  /** Where the SQLite database was moved after a successful migration, or null if it stayed. */
  readonly backupPath: string | null;
}

/** Suffix of the SQLite database once its segments are in the catalog. */
export const MIGRATED_SUFFIX = '.migrated';

/**
 * One-time migration of a SQLite segment database (ADR-0009) into the JSON catalog (ADR-0011,
 * BR-30). Runs only when the catalog file does not exist yet and the database does. Every segment
 * is copied with its details, route, elevation values, efforts and import dates; the written file
 * is read back and compared before the database is moved aside to `<file>.migrated`, so a failed
 * migration leaves the database where it was and writes no catalog. Returns null when there was
 * nothing to migrate.
 */
// Implements: BR-30
export function migrateLegacyDatabase(
  databasePath: string,
  catalogPath: string,
): LegacyMigration | null {
  if (catalogPath === ':memory:' || existsSync(catalogPath) || !existsSync(databasePath)) {
    return null;
  }
  const legacy = createSegmentRepository(openDatabase(databasePath));
  const catalog = new Map<string, CatalogEntry>();
  try {
    for (const { segmentId } of legacy.list()) {
      const detail = legacy.get(segmentId);
      if (!detail) continue;
      const record: Record<string, unknown> = { segmentId };
      for (const field of SEGMENT_FIELDS) record[field] = detail[field];
      catalog.set(segmentId, {
        record: record as unknown as SegmentRecord,
        sourceFile: detail.sourceFile,
        importedAt: detail.importedAt,
        updatedAt: detail.updatedAt,
        efforts: detail.efforts.map(({ isPersonalBest: _, ...effort }) => effort),
      });
    }
  } finally {
    legacy.close();
  }

  saveCatalogFile(catalogPath, catalog);
  if (!sameCatalog(loadCatalogFile(catalogPath), catalog)) {
    rmSync(catalogPath, { force: true });
    throw new Error('Segment catalog migration check failed; the SQLite database is unchanged.');
  }

  let backupPath: string | null = `${databasePath}${MIGRATED_SUFFIX}`;
  try {
    renameSync(databasePath, backupPath);
    for (const suffix of ['-wal', '-shm']) {
      if (existsSync(databasePath + suffix)) rmSync(databasePath + suffix, { force: true });
    }
  } catch {
    // The catalog now exists, so the database is never migrated again; it just stays in place.
    backupPath = null;
  }
  const efforts = [...catalog.values()].reduce((sum, entry) => sum + entry.efforts.length, 0);
  return { segments: catalog.size, efforts, backupPath };
}

/** Same segments, values and efforts, ignoring effort order. */
function sameCatalog(a: Catalog, b: Catalog): boolean {
  const normalized = (entry: CatalogEntry) => ({
    ...entry,
    efforts: [...entry.efforts].sort((x, y) => (effortKey(x) < effortKey(y) ? -1 : 1)),
  });
  return (
    a.size === b.size &&
    [...b].every(([id, entry]) => {
      const other = a.get(id);
      return other !== undefined && isDeepStrictEqual(normalized(other), normalized(entry));
    })
  );
}

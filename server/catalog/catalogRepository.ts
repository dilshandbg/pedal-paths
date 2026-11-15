import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type {
  SegmentDetail,
  SegmentEffortRecord,
  SegmentImportPayload,
  StoredSegment,
  StoredSegmentEffort,
} from '../../src/types/segment';
import {
  planSegmentImport,
  type StoredSegmentState,
} from '../../src/features/segments/services/planSegmentImport';
import {
  effortKey,
  mergeSegment,
  personalBest,
} from '../../src/features/segments/services/segmentRules';
import { validateSegmentPayload } from '../../src/features/segments/services/validateSegmentPayload';
import type { SegmentRepository } from '../segments/repository';
import { type Catalog, type CatalogEntry, readCatalog, serializeCatalog } from './catalogFormat';

/** The catalog file cannot be loaded; the API answers `storage-unavailable` and writes nothing. */
export class CatalogFileError extends Error {}

/** Reads the catalog at `path`. A missing file is an empty catalog. */
export function loadCatalogFile(path: string): Catalog {
  if (path === ':memory:' || !existsSync(path)) return new Map();
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new CatalogFileError(`${path} is not valid JSON.`);
  }
  const result = readCatalog(json);
  if (!result.ok) {
    const details = result.problems
      .slice(0, 10)
      .map((p) => `${p.location}${p.field ? ` ${p.field}` : ''}: ${p.message}`)
      .join('; ');
    throw new CatalogFileError(`${path} is not a valid segment catalog: ${details}`);
  }
  return result.catalog;
}

/**
 * Writes the catalog to `path` atomically: a temporary file next to it is renamed over it, so the
 * file always holds either the old or the new catalog, never a partial one.
 */
export function saveCatalogFile(path: string, catalog: Catalog): void {
  if (path === ':memory:') return;
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  try {
    writeFileSync(temporary, serializeCatalog(catalog), 'utf8');
    renameSync(temporary, path);
  } catch (error) {
    rmSync(temporary, { force: true });
    throw error;
  }
}

const byName = (a: StoredSegment, b: StoredSegment) => {
  const x = a.name.toLowerCase();
  const y = b.name.toLowerCase();
  return x < y
    ? -1
    : x > y
      ? 1
      : a.segmentId.length - b.segmentId.length || (a.segmentId < b.segmentId ? -1 : 1);
};

/** Fastest first, earliest on a tie (RULE-17). */
const fastestFirst = (a: SegmentEffortRecord, b: SegmentEffortRecord) =>
  a.elapsedTimeS - b.elapsedTimeS ||
  (a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0);

function toStored(entry: CatalogEntry): StoredSegment {
  return {
    ...entry.record,
    sourceFile: entry.sourceFile,
    importedAt: entry.importedAt,
    updatedAt: entry.updatedAt,
    storedEffortCount: entry.efforts.length,
    personalBest: personalBest(entry.record, entry.efforts),
  };
}

/**
 * Segment storage in the local JSON catalog file (ADR-0011). The catalog is loaded once, when the
 * API first needs it, and every change is written to the file before it takes effect in memory,
 * so a failed write changes nothing. Every write goes through the same pure validation and import
 * plan the browser uses, so the review matches what is stored. `':memory:'` keeps it in memory.
 */
// Implements: BR-23, BR-24, BR-27, BR-29, RULE-14, RULE-16, RULE-17
export function openCatalogRepository(path: string): SegmentRepository {
  let catalog = loadCatalogFile(path);

  const commit = (next: Catalog) => {
    saveCatalogFile(path, next);
    catalog = next;
  };

  function prepare(input: unknown) {
    const validation = validateSegmentPayload(input, new Set(catalog.keys()));
    if (!validation.ok) return validation;
    const { payload } = validation;
    const stored = new Map<string, StoredSegmentState>();
    for (const id of [
      ...payload.segments.map((segment) => segment.segmentId),
      ...payload.efforts.map((effort) => effort.segmentId),
    ]) {
      const entry = catalog.get(id);
      if (entry && !stored.has(id)) {
        stored.set(id, { record: entry.record, effortKeys: new Set(entry.efforts.map(effortKey)) });
      }
    }
    return { ok: true as const, payload, stored };
  }

  function apply(
    payload: SegmentImportPayload,
    stored: Map<string, StoredSegmentState>,
    now: Date,
  ) {
    const plan = planSegmentImport(stored, payload);
    const timestamp = now.toISOString();
    const status = new Map(plan.items.map((entry) => [entry.segmentId, entry.status]));
    const next = new Map(catalog);
    for (const incoming of payload.segments) {
      if (status.get(incoming.segmentId) === 'unchanged') continue;
      const existing = next.get(incoming.segmentId);
      next.set(incoming.segmentId, {
        record: mergeSegment(existing?.record ?? null, incoming),
        sourceFile: payload.sourceFile,
        importedAt: existing?.importedAt ?? timestamp,
        updatedAt: timestamp,
        efforts: existing?.efforts ?? [],
      });
    }
    const segmentIds = new Set(payload.segments.map((segment) => segment.segmentId));
    for (const entry of plan.items) {
      const existing = next.get(entry.segmentId);
      // Efforts-only update: the segment details stay, the import is recorded.
      if (existing && entry.status === 'update' && !segmentIds.has(entry.segmentId)) {
        next.set(entry.segmentId, {
          ...existing,
          sourceFile: payload.sourceFile,
          updatedAt: timestamp,
        });
      }
    }
    const added = new Map<string, { keys: Set<string>; efforts: SegmentEffortRecord[] }>();
    for (const effort of payload.efforts) {
      const existing = next.get(effort.segmentId);
      if (!existing) continue;
      let segment = added.get(effort.segmentId);
      if (!segment) {
        segment = {
          keys: new Set(existing.efforts.map(effortKey)),
          efforts: [...existing.efforts],
        };
        added.set(effort.segmentId, segment);
      }
      const key = effortKey(effort);
      if (segment.keys.has(key)) continue; // already stored (RULE-16)
      segment.keys.add(key);
      segment.efforts.push(effort);
    }
    for (const [segmentId, { efforts }] of added) {
      const existing = next.get(segmentId);
      if (existing) next.set(segmentId, { ...existing, efforts });
    }
    commit(next);
    return plan;
  }

  return {
    list: () => [...catalog.values()].map(toStored).sort(byName),

    get(segmentId) {
      const entry = catalog.get(segmentId);
      if (!entry) return null;
      const segment = toStored(entry);
      const efforts = [...entry.efforts].sort(fastestFirst);
      const bestKey =
        segment.personalBest?.source === 'efforts' && efforts[0] ? effortKey(efforts[0]) : null;
      const detail: SegmentDetail = {
        ...segment,
        efforts: efforts.map((effort): StoredSegmentEffort => ({
          ...effort,
          isPersonalBest: bestKey !== null && effortKey(effort) === bestKey,
        })),
      };
      return detail;
    },

    preview(input) {
      const prepared = prepare(input);
      if (!prepared.ok) return prepared;
      return { ok: true, plan: planSegmentImport(prepared.stored, prepared.payload) };
    },

    importPayload(input, now = new Date()) {
      const prepared = prepare(input);
      if (!prepared.ok) return prepared;
      return { ok: true, plan: apply(prepared.payload, prepared.stored, now) };
    },

    remove(segmentId) {
      if (!catalog.has(segmentId)) return false;
      const next = new Map(catalog);
      next.delete(segmentId);
      commit(next);
      return true;
    },

    removeAll() {
      const count = catalog.size;
      // The emptied file stays, so a legacy database is never migrated in again (BR-30).
      commit(new Map());
      return count;
    },

    close: () => undefined,
  };
}

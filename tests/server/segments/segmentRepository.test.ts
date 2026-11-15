// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openDatabase, SCHEMA_VERSION } from '../../../server/db/database';
import { createSegmentRepository } from '../../../server/segments/segmentRepository';
import { effort, payload, segment } from '../fixtures';
import { describeSegmentRepository } from './repositoryContract';

const T1 = new Date('2025-01-01T10:00:00.000Z');

/* The legacy SQLite store (ADR-0009), now only read by the migration to the catalog (BR-30). */
describe('legacy SQLite segment store', () => {
  describeSegmentRepository(() => createSegmentRepository(openDatabase(':memory:')));
});

describe('legacy SQLite database file', () => {
  it('keeps the data when the database is reopened', () => {
    const dir = mkdtempSync(join(tmpdir(), 'segments-'));
    const file = join(dir, 'nested', 'segments.sqlite');
    try {
      const first = createSegmentRepository(openDatabase(file));
      first.importPayload(payload([segment()], [effort()]), T1);
      first.close();

      const second = createSegmentRepository(openDatabase(file));
      expect(second.list().map((s) => s.segmentId)).toEqual(['1001']);
      expect(second.get('1001')?.efforts).toHaveLength(1);
      second.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('records the schema version and refuses a newer database', () => {
    const dir = mkdtempSync(join(tmpdir(), 'segments-'));
    const file = join(dir, 'segments.sqlite');
    try {
      const db = openDatabase(file);
      expect(db.prepare('PRAGMA user_version').get()).toEqual({ user_version: SCHEMA_VERSION });
      db.exec(`PRAGMA user_version = ${SCHEMA_VERSION + 1}`);
      db.close();
      expect(() => openDatabase(file)).toThrow(/newer than this application/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

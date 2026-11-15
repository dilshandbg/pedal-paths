import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SegmentRepository } from '../../../server/segments/repository';
import { effort, payload, segment } from '../fixtures';

const T1 = new Date('2025-01-01T10:00:00.000Z');
const T2 = new Date('2025-02-01T10:00:00.000Z');

/**
 * Behaviour every segment store must have (BR-22 – BR-27). Run against the JSON catalog
 * (ADR-0011) and the legacy SQLite store it replaces, so the replacement behaves the same.
 */
export function describeSegmentRepository(createRepository: () => SegmentRepository) {
  let repository: SegmentRepository;

  beforeEach(() => {
    repository = createRepository();
  });
  afterEach(() => {
    repository.close();
  });

  const importOk = (input: unknown, now = T1) => {
    const result = repository.importPayload(input, now);
    if (!result.ok) throw new Error(JSON.stringify(result.problems));
    return result.plan;
  };

  describe('BR-23 / AC-23: segments are stored', () => {
    it('stores and lists a segment with all its details, route and personal best', () => {
      importOk(payload([segment()], [effort(), effort({ effortId: '5002', elapsedTimeS: 290 })]));

      expect(repository.list()).toEqual([
        {
          ...segment(),
          sourceFile: 'segments.json',
          importedAt: T1.toISOString(),
          updatedAt: T1.toISOString(),
          storedEffortCount: 2,
          personalBest: { elapsedTimeS: 290, date: '2024-05-01', source: 'efforts' },
        },
      ]);
    });

    it('lists segments by name and keeps segments without optional details', () => {
      importOk(
        payload([
          segment({ segmentId: '2', name: 'beta' }),
          segment({
            segmentId: '3',
            name: 'Alpha',
            distanceM: null,
            start: null,
            end: null,
            route: null,
            prElapsedTimeS: null,
            prDate: null,
          }),
        ]),
      );
      const [alpha, beta] = repository.list();
      expect([alpha?.name, beta?.name]).toEqual(['Alpha', 'beta']);
      expect(alpha).toMatchObject({ distanceM: null, route: null, personalBest: null });
    });
  });

  describe('BR-22: preview stores nothing', () => {
    it('classifies the import without writing', () => {
      const result = repository.preview(payload([segment()], [effort()]));
      expect(result.ok && result.plan.counts).toEqual({ new: 1, update: 0, unchanged: 0 });
      expect(repository.list()).toEqual([]);
    });

    it('rejects an invalid payload with its problems', () => {
      const result = repository.preview(payload([segment({ name: '' })]));
      expect(result.ok).toBe(false);
      expect(!result.ok && result.problems[0]?.field).toBe('name');
    });
  });

  describe('BR-24 / AC-24: re-importing updates stored segments', () => {
    it('updates present fields, keeps absent ones and keeps the import date', () => {
      importOk(payload([segment()], [effort()]));
      const plan = importOk(
        payload(
          [segment({ name: 'Test Hill v2', distanceM: 1510, city: null })],
          [effort(), effort({ effortId: '5003', elapsedTimeS: 280 })],
          'update.csv',
        ),
        T2,
      );

      expect(plan.items[0]).toMatchObject({
        status: 'update',
        changedFields: ['name', 'distanceM'],
        newEffortCount: 1,
      });
      expect(repository.list()).toHaveLength(1);
      expect(repository.get('1001')).toMatchObject({
        name: 'Test Hill v2',
        distanceM: 1510,
        city: 'Testville',
        sourceFile: 'update.csv',
        importedAt: T1.toISOString(),
        updatedAt: T2.toISOString(),
        storedEffortCount: 2, // the repeated effort 5001 is not stored twice
      });
    });

    it('leaves an unchanged segment untouched', () => {
      importOk(payload([segment()], [effort()]));
      const plan = importOk(payload([segment()], [effort()], 'again.json'), T2);
      expect(plan.counts).toEqual({ new: 0, update: 0, unchanged: 1 });
      expect(repository.get('1001')).toMatchObject({
        sourceFile: 'segments.json',
        updatedAt: T1.toISOString(),
      });
    });

    it('adds efforts from an efforts-only import to a stored segment', () => {
      importOk(payload([segment()]));
      const plan = importOk(payload([], [effort()], 'efforts.csv'), T2);
      expect(plan.items[0]).toMatchObject({
        segmentId: '1001',
        status: 'update',
        newEffortCount: 1,
      });
      expect(repository.get('1001')).toMatchObject({
        storedEffortCount: 1,
        sourceFile: 'efforts.csv',
        updatedAt: T2.toISOString(),
      });
    });

    it('deduplicates efforts without an ID by start time and elapsed time', () => {
      const noId = effort({ effortId: null, startDate: '2024-05-01T07:00:00Z' });
      importOk(payload([segment()], [noId]));
      importOk(payload([], [{ ...noId, startDate: '2024-05-01T09:00:00+02:00' }]), T2);
      expect(repository.get('1001')?.storedEffortCount).toBe(1);
    });

    it('RULE-15: an invalid import stores nothing at all', () => {
      const result = repository.importPayload(
        payload([segment({ segmentId: '1' }), segment({ segmentId: '2', distanceM: -1 })]),
        T1,
      );
      expect(result.ok).toBe(false);
      expect(repository.list()).toEqual([]);
    });

    it('rejects efforts for a segment that is not stored', () => {
      const result = repository.importPayload(payload([], [effort({ segmentId: '77' })]), T1);
      expect(!result.ok && result.problems[0]?.message).toMatch(/not in this import or stored/);
    });
  });

  describe('BR-26 / RULE-17: segment detail and personal best', () => {
    it('lists efforts fastest first and marks the personal best', () => {
      importOk(
        payload(
          [segment()],
          [
            effort({ effortId: '11', elapsedTimeS: 300 }),
            effort({ effortId: '12', elapsedTimeS: 290, startDate: '2024-06-01T07:00:00.000Z' }),
            effort({ effortId: '13', elapsedTimeS: 290, startDate: '2023-06-01T07:00:00.000Z' }),
          ],
        ),
      );
      const detail = repository.get('1001');
      expect(detail?.efforts.map((e) => [e.effortId, e.isPersonalBest])).toEqual([
        ['13', true],
        ['12', false],
        ['11', false],
      ]);
      expect(detail?.personalBest).toEqual({
        elapsedTimeS: 290,
        date: '2023-06-01',
        source: 'efforts',
      });
    });

    it('uses the stated personal best when there are no efforts', () => {
      importOk(payload([segment()]));
      expect(repository.get('1001')).toMatchObject({
        efforts: [],
        personalBest: { elapsedTimeS: 320, date: '2024-01-01', source: 'stated' },
      });
    });

    it('returns null for a segment that is not stored', () => {
      expect(repository.get('404')).toBeNull();
    });
  });

  describe('BR-27 / AC-27: removing segment data', () => {
    it('removes one segment with its efforts', () => {
      importOk(payload([segment(), segment({ segmentId: '2' })], [effort()]));
      expect(repository.remove('1001')).toBe(true);
      expect(repository.remove('1001')).toBe(false);
      expect(repository.list().map((s) => s.segmentId)).toEqual(['2']);
      expect(repository.get('1001')).toBeNull();

      // Its efforts went with it: re-importing the segment starts with none.
      importOk(payload([segment()]), T2);
      expect(repository.get('1001')?.storedEffortCount).toBe(0);
    });

    it('removes all segment data', () => {
      importOk(payload([segment(), segment({ segmentId: '2' })], [effort()]));
      expect(repository.removeAll()).toBe(2);
      expect(repository.list()).toEqual([]);
    });
  });
}

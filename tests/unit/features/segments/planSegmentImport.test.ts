import { describe, expect, it } from 'vitest';
import {
  planSegmentImport,
  type StoredSegmentState,
} from '@/features/segments/services/planSegmentImport';
import { effortKey } from '@/features/segments/services/segmentRules';
import type { SegmentEffortRecord, SegmentRecord } from '@/types';
import { effortRecord, segmentRecord } from './fixtures';

const stored = (record: SegmentRecord, efforts: SegmentEffortRecord[] = []) =>
  new Map<string, StoredSegmentState>([
    [record.segmentId, { record, effortKeys: new Set(efforts.map(effortKey)) }],
  ]);

const payload = (segments: SegmentRecord[], efforts: SegmentEffortRecord[] = []) => ({
  sourceFile: 'f.json',
  segments,
  efforts,
});

describe('BR-22 / BR-24: planSegmentImport', () => {
  it('AC-22: marks segments that are not stored as new, counting their efforts', () => {
    const plan = planSegmentImport(new Map(), payload([segmentRecord()], [effortRecord()]));

    expect(plan.items).toEqual([
      {
        segmentId: '1001',
        name: 'Test Hill',
        distanceM: 1500,
        elevationGainM: 80,
        status: 'new',
        changedFields: [],
        newEffortCount: 1,
      },
    ]);
    expect(plan.counts).toEqual({ new: 1, update: 0, unchanged: 0 });
    expect(plan.newEffortCount).toBe(1);
  });

  it('AC-24: marks a stored segment with changed details as an update, naming the fields', () => {
    const plan = planSegmentImport(
      stored(segmentRecord()),
      payload([segmentRecord({ distanceM: 1510, name: 'New name' })]),
    );
    expect(plan.items[0]?.status).toBe('update');
    expect(plan.items[0]?.changedFields).toEqual(['name', 'distanceM']);
  });

  it('marks a stored segment as unchanged when nothing would change', () => {
    const effort = effortRecord();
    const plan = planSegmentImport(
      stored(segmentRecord(), [effort]),
      payload([segmentRecord({ city: null })], [effort]),
    );
    expect(plan.items[0]?.status).toBe('unchanged'); // city absent: the stored value stays
    expect(plan.newEffortCount).toBe(0);
  });

  it('AC-24: an import that only adds efforts is an update', () => {
    const plan = planSegmentImport(
      stored(segmentRecord(), [effortRecord()]),
      payload([segmentRecord()], [effortRecord(), effortRecord({ effortId: '5002' })]),
    );
    expect(plan.items[0]).toMatchObject({ status: 'update', changedFields: [], newEffortCount: 1 });
  });

  it('does not count an effort repeated within the file twice', () => {
    const repeated = effortRecord({ effortId: null });
    const plan = planSegmentImport(new Map(), payload([segmentRecord()], [repeated, repeated]));
    expect(plan.newEffortCount).toBe(1);
  });

  it('plans an efforts-only file (efforts CSV) against stored segments', () => {
    const plan = planSegmentImport(
      stored(segmentRecord(), [effortRecord()]),
      payload([], [effortRecord({ effortId: '5003' })]),
    );
    expect(plan.items).toHaveLength(1);
    expect(plan.items[0]).toMatchObject({ segmentId: '1001', status: 'update', newEffortCount: 1 });

    const nothingNew = planSegmentImport(
      stored(segmentRecord(), [effortRecord()]),
      payload([], [effortRecord()]),
    );
    expect(nothingNew.items[0]?.status).toBe('unchanged');
    expect(nothingNew.counts).toEqual({ new: 0, update: 0, unchanged: 1 });
  });
});

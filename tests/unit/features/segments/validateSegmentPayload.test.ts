import { describe, expect, it } from 'vitest';
import { validateSegmentPayload } from '@/features/segments/services/validateSegmentPayload';
import { effortRecord, segmentRecord } from './fixtures';

const payload = (patch: Record<string, unknown> = {}) => ({
  sourceFile: 'segments.json',
  segments: [segmentRecord()],
  efforts: [effortRecord()],
  ...patch,
});

const problemsOf = (input: unknown, known?: ReadonlySet<string>) => {
  const result = validateSegmentPayload(input, known);
  return result.ok ? [] : result.problems;
};

describe('BR-21 / NFR-08: validateSegmentPayload', () => {
  it('accepts a valid payload unchanged', () => {
    const result = validateSegmentPayload(payload());
    expect(result).toEqual({ ok: true, payload: payload() });
  });

  it('accepts a minimal segment with only ID and name', () => {
    const minimal = {
      segmentId: '7',
      name: 'Bare',
      ...Object.fromEntries(
        Object.keys(segmentRecord())
          .filter((key) => key !== 'segmentId' && key !== 'name')
          .map((key) => [key, null]),
      ),
    };
    expect(validateSegmentPayload(payload({ segments: [minimal], efforts: [] })).ok).toBe(true);
  });

  it('rejects input that is not a payload object', () => {
    expect(problemsOf(null)[0]?.message).toBe('Expected an object.');
    expect(problemsOf({ sourceFile: 'x', segments: 'no' })[0]?.message).toMatch(/lists/);
    expect(problemsOf(payload({ segments: [], efforts: [] }))[0]?.message).toMatch(/no segments/);
  });

  it.each([
    ['segmentId', '0'],
    ['segmentId', 'abc'],
    ['segmentId', 1001],
    ['name', '  '],
    ['distanceM', -1],
    ['distanceM', '12'],
    ['averageGradePct', 101],
    ['start', { latitude: 91, longitude: 0 }],
    ['route', [{ latitude: 0, longitude: 0 }]],
    [
      'route',
      [
        { latitude: 0, longitude: 0 },
        { latitude: 0, longitude: 200 },
      ],
    ],
    ['prElapsedTimeS', 12.5],
    ['prDate', '2024-02-30'],
    ['effortCount', -3],
  ])('reports an invalid %s (%j)', (field, value) => {
    const problems = problemsOf(payload({ segments: [segmentRecord({ [field]: value })] }));
    expect(problems.some((problem) => problem.field === field)).toBe(true);
  });

  it('AC-24: rejects a segment ID that appears twice in one import', () => {
    const problems = problemsOf(payload({ segments: [segmentRecord(), segmentRecord()] }));
    expect(problems).toEqual([
      { location: 'segment 2 (ID 1001)', field: 'segmentId', message: 'Appears more than once.' },
    ]);
  });

  it.each([
    ['startDate', '2024-06-01 07:00'],
    ['startDate', null],
    ['elapsedTimeS', 0],
    ['elapsedTimeS', null],
    ['movingTimeS', -1],
    ['effortId', 'x1'],
  ])('reports an invalid effort %s (%j)', (field, value) => {
    const problems = problemsOf(payload({ efforts: [effortRecord({ [field]: value } as never)] }));
    expect(problems.some((problem) => problem.field === field)).toBe(true);
  });

  it('normalizes effort start dates to UTC', () => {
    const result = validateSegmentPayload(
      payload({ efforts: [effortRecord({ startDate: '2024-05-01T09:00:00+02:00' })] }),
    );
    expect(result.ok && result.payload.efforts[0]?.startDate).toBe('2024-05-01T07:00:00.000Z');
  });

  it('rejects efforts for a segment that is neither in the import nor stored', () => {
    const orphan = payload({ segments: [], efforts: [effortRecord({ segmentId: '42' })] });
    expect(problemsOf(orphan)[0]).toEqual({
      location: 'effort 1',
      field: 'segmentId',
      message: 'Segment 42 is not in this import or stored.',
    });
    expect(validateSegmentPayload(orphan, new Set(['42'])).ok).toBe(true);
  });

  it('RULE-15: reports every problem, so nothing partial is imported', () => {
    const problems = problemsOf(
      payload({
        segments: [segmentRecord({ name: '' }), segmentRecord({ segmentId: '2', distanceM: -5 })],
      }),
    );
    // The effort refers to the invalid segment 1001, so it is reported too.
    expect(problems.map((problem) => problem.location)).toEqual([
      'segment 1',
      'segment 2',
      'effort 1',
    ]);
  });

  it('enforces the size limits', () => {
    const many = Array.from({ length: 10_001 }, (_, k) =>
      segmentRecord({ segmentId: String(k + 1) }),
    );
    expect(problemsOf(payload({ segments: many, efforts: [] }))[0]?.message).toMatch(/10000/);
  });
});

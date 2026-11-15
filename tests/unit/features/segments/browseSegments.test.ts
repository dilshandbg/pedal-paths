import { describe, expect, it } from 'vitest';
import {
  browseSegments,
  DEFAULT_BROWSE_CRITERIA,
  parseDistanceInput,
  type SegmentBrowseCriteria,
} from '@/features/segments/utils/browseSegments';
import { storedSegment } from './storedFixtures';

const segments = [
  storedSegment({ segmentId: '1', name: 'Hawk Hill', distanceM: 2700, elevationGainM: 155 }),
  storedSegment({
    segmentId: '2',
    name: 'alpine dam',
    distanceM: 11_000,
    elevationGainM: 400,
    personalBest: { elapsedTimeS: 1800, date: null, source: 'stated' },
  }),
  storedSegment({
    segmentId: '3',
    name: 'Bridge sprint',
    distanceM: 500,
    elevationGainM: 2,
    personalBest: { elapsedTimeS: 60, date: null, source: 'efforts' },
  }),
  storedSegment({
    segmentId: '4',
    name: 'Mystery hill',
    distanceM: null,
    elevationGainM: null,
    personalBest: null,
  }),
];

const browse = (criteria: Partial<SegmentBrowseCriteria>) =>
  browseSegments(segments, { ...DEFAULT_BROWSE_CRITERIA, ...criteria }).map((s) => s.segmentId);

describe('BR-25 / AC-25: browseSegments', () => {
  it('lists every segment by name by default, ignoring case', () => {
    expect(browse({})).toEqual(['2', '3', '1', '4']);
  });

  it('searches names case-insensitively, ignoring surrounding spaces', () => {
    expect(browse({ query: '  HILL ' })).toEqual(['1', '4']);
    expect(browse({ query: 'nothing' })).toEqual([]);
  });

  it('filters by an inclusive distance range in km', () => {
    expect(browse({ minDistanceKm: 2.7 })).toEqual(['2', '1']);
    expect(browse({ maxDistanceKm: 2.7 })).toEqual(['3', '1']);
    expect(browse({ minDistanceKm: 1, maxDistanceKm: 5 })).toEqual(['1']);
    expect(browse({ minDistanceKm: 5, maxDistanceKm: 1 })).toEqual([]);
  });

  it('excludes segments of unknown distance only while a distance bound is set', () => {
    expect(browse({ minDistanceKm: 0 })).not.toContain('4');
    expect(browse({})).toContain('4');
  });

  it('sorts by distance, elevation gain and personal best, unknown values last', () => {
    expect(browse({ sort: 'distance-asc' })).toEqual(['3', '1', '2', '4']);
    expect(browse({ sort: 'distance-desc' })).toEqual(['2', '1', '3', '4']);
    expect(browse({ sort: 'elevation-desc' })).toEqual(['2', '1', '3', '4']);
    expect(browse({ sort: 'elevation-asc' })).toEqual(['3', '1', '2', '4']);
    expect(browse({ sort: 'personal-best-asc' })).toEqual(['3', '1', '2', '4']);
    expect(browse({ sort: 'personal-best-desc' })).toEqual(['2', '1', '3', '4']);
  });

  it('combines search, filter and sort without changing the input', () => {
    const before = segments.map((s) => s.segmentId);
    expect(browse({ query: 'i', minDistanceKm: 0.1, sort: 'distance-desc' })).toEqual([
      '2',
      '1',
      '3',
    ]);
    expect(segments.map((s) => s.segmentId)).toEqual(before);
  });

  it('handles an empty list', () => {
    expect(browseSegments([], DEFAULT_BROWSE_CRITERIA)).toEqual([]);
  });
});

describe('parseDistanceInput', () => {
  it('reads non-negative numbers and treats anything else as no bound', () => {
    expect(parseDistanceInput('2.5')).toBe(2.5);
    expect(parseDistanceInput('0')).toBe(0);
    expect(parseDistanceInput('')).toBeNull();
    expect(parseDistanceInput('  ')).toBeNull();
    expect(parseDistanceInput('-1')).toBeNull();
    expect(parseDistanceInput('abc')).toBeNull();
  });
});

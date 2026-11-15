import { describe, expect, it } from 'vitest';
import {
  formatDistanceKm,
  formatDuration,
  formatElapsedTime,
  formatElevationM,
} from '@/utils/units';

describe('formatDistanceKm', () => {
  it('shows kilometres with one decimal and thousands separators', () => {
    expect(formatDistanceKm(1234.56)).toBe('1,234.6 km');
    expect(formatDistanceKm(0)).toBe('0.0 km');
  });
});

describe('formatElevationM', () => {
  it('shows whole metres with thousands separators', () => {
    expect(formatElevationM(12345.6)).toBe('12,346 m');
    expect(formatElevationM(0)).toBe('0 m');
  });
});

describe('formatDuration', () => {
  it('shows minutes below an hour, hours and two-digit minutes above', () => {
    expect(formatDuration(0)).toBe('0 min');
    expect(formatDuration(45 * 60)).toBe('45 min');
    expect(formatDuration(3 * 3600 + 5 * 60)).toBe('3 h 05 min');
  });

  it('rounds to whole minutes and groups thousands of hours', () => {
    expect(formatDuration(89)).toBe('1 min');
    expect(formatDuration(3599.9)).toBe('1 h 00 min');
    expect(formatDuration(1204 * 3600 + 30 * 60)).toBe('1,204 h 30 min');
  });

  it('treats a negative duration as zero', () => {
    expect(formatDuration(-5)).toBe('0 min');
  });
});

describe('formatElapsedTime', () => {
  it('formats seconds, minutes and hours like a stopwatch', () => {
    expect(formatElapsedTime(0)).toBe('0:00');
    expect(formatElapsedTime(45)).toBe('0:45');
    expect(formatElapsedTime(553)).toBe('9:13');
    expect(formatElapsedTime(3600)).toBe('1:00:00');
    expect(formatElapsedTime(3723)).toBe('1:02:03');
  });

  it('rounds to whole seconds and clamps negatives', () => {
    expect(formatElapsedTime(59.6)).toBe('1:00');
    expect(formatElapsedTime(-5)).toBe('0:00');
  });
});

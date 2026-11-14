import { describe, expect, it } from 'vitest';
import { formatDistanceKm, formatElevationM } from '@/utils/units';

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

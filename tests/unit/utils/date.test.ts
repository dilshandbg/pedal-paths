import { describe, expect, it } from 'vitest';
import { formatShortDate, getYearMonth } from '@/utils/date';

describe('getYearMonth', () => {
  it('derives year and month in the given time zone', () => {
    expect(getYearMonth('2023-11-14T07:12:45.000Z', 'UTC')).toEqual({ year: 2023, month: 11 });
  });

  it('moves a late New Year’s Eve UTC ride into the next year east of UTC (ADR-0007)', () => {
    const lateRide = '2023-12-31T20:00:00.000Z';
    expect(getYearMonth(lateRide, 'UTC')).toEqual({ year: 2023, month: 12 });
    expect(getYearMonth(lateRide, 'Asia/Colombo')).toEqual({ year: 2024, month: 1 }); // UTC+5:30
  });

  it('moves an early-morning UTC ride into the previous month west of UTC', () => {
    expect(getYearMonth('2024-03-01T03:00:00.000Z', 'America/New_York')).toEqual({
      year: 2024,
      month: 2,
    });
  });

  it('uses the local time zone when none is given', () => {
    const iso = '2024-06-15T12:00:00.000Z';
    const local = new Date(iso);
    expect(getYearMonth(iso)).toEqual({ year: local.getFullYear(), month: local.getMonth() + 1 });
  });

  it('returns null for an invalid date', () => {
    expect(getYearMonth('not a date')).toBeNull();
  });
});

describe('formatShortDate', () => {
  it('formats a medium date in the given time zone', () => {
    expect(formatShortDate('2023-11-05T08:00:00.000Z', 'UTC')).toBe('Nov 5, 2023');
  });

  it('uses the calendar day of the time zone, not of UTC', () => {
    expect(formatShortDate('2023-12-31T23:30:00.000Z', 'Asia/Tokyo')).toBe('Jan 1, 2024');
  });

  it('returns an empty string for an invalid date', () => {
    expect(formatShortDate('not a date')).toBe('');
  });
});

import { describe, expect, it } from 'vitest';
import { getYearMonth } from '@/utils/date';

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

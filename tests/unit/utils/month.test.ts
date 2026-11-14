import { describe, expect, it } from 'vitest';
import { isMonth, MONTHS, monthName } from '@/utils/month';

describe('MONTHS', () => {
  it('lists the twelve calendar months in order', () => {
    expect(MONTHS).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });
});

describe('isMonth', () => {
  it.each(MONTHS)('accepts %s', (value) => {
    expect(isMonth(value)).toBe(true);
  });

  it.each([0, 13, -1, 1.5, Number.NaN])('rejects %s', (value) => {
    expect(isMonth(value)).toBe(false);
  });
});

describe('monthName', () => {
  it('names months 1-based: 1 is January, 12 is December', () => {
    expect(monthName(1)).toBe('January');
    expect(monthName(12)).toBe('December');
  });

  it('names every month', () => {
    expect(MONTHS.map(monthName)).toHaveLength(12);
    expect(new Set(MONTHS.map(monthName)).size).toBe(12);
  });
});

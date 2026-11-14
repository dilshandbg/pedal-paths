import { describe, expect, it } from 'vitest';
import { EMPTY_ACTIVITY_FILTER } from '@/features/filters/store/filterStore';
import { isFilterActive } from '@/features/filters/utils/isFilterActive';

describe('BR-15: isFilterActive', () => {
  it('is false for the unrestricted filter: there is nothing to reset', () => {
    expect(isFilterActive(EMPTY_ACTIVITY_FILTER)).toBe(false);
  });

  it.each([
    ['a selected year', { selectedYears: [2023] }],
    ['a selected month', { selectedMonths: [11 as const] }],
    ['a deselected ride', { excludedActivityIds: ['a'] }],
  ])('is true with %s', (_, patch) => {
    expect(isFilterActive({ ...EMPTY_ACTIVITY_FILTER, ...patch })).toBe(true);
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import { EMPTY_ACTIVITY_FILTER, useFilterStore } from '@/features/filters/store/filterStore';

describe('useFilterStore', () => {
  beforeEach(() => {
    useFilterStore.setState(useFilterStore.getInitialState(), true);
  });

  it('starts unrestricted: all years, months and rides included', () => {
    expect(useFilterStore.getState().filter).toEqual({
      selectedYears: [],
      selectedMonths: [],
      excludedActivityIds: [],
    });
  });

  it('merges partial updates without touching other criteria', () => {
    const { setFilter } = useFilterStore.getState();

    setFilter({ selectedYears: [2024] });
    setFilter({ selectedMonths: [3, 4] });

    expect(useFilterStore.getState().filter).toEqual({
      selectedYears: [2024],
      selectedMonths: [3, 4],
      excludedActivityIds: [],
    });
  });

  it('resets to the empty filter', () => {
    const { setFilter, resetFilter } = useFilterStore.getState();
    setFilter({ selectedYears: [2023], excludedActivityIds: ['ride-1'] });

    resetFilter();

    expect(useFilterStore.getState().filter).toBe(EMPTY_ACTIVITY_FILTER);
  });

  it('never mutates the shared empty filter', () => {
    useFilterStore.getState().setFilter({ selectedYears: [2022] });

    expect(Object.isFrozen(EMPTY_ACTIVITY_FILTER)).toBe(true);
    expect(EMPTY_ACTIVITY_FILTER.selectedYears).toEqual([]);
  });
});

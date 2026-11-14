import { create } from 'zustand';
import type { ActivityFilter } from '@/types';

/** Initial filter: every year, month and ride is included (ADR-0005, AC-06, AC-14). */
export const EMPTY_ACTIVITY_FILTER: ActivityFilter = Object.freeze({
  selectedYears: [],
  selectedMonths: [],
  excludedActivityIds: [],
});

export interface FilterState {
  readonly filter: ActivityFilter;
  /** Replaces the given criteria and leaves the others untouched. */
  setFilter: (patch: Partial<ActivityFilter>) => void;
  resetFilter: () => void;
}

/**
 * Holds the user's filter selection. It stores state only: it does not decide which activities
 * match. Matching is a pure function in `features/filters/utils` (ADR-0005).
 */
export const useFilterStore = create<FilterState>()((set) => ({
  filter: EMPTY_ACTIVITY_FILTER,
  setFilter: (patch) => set((state) => ({ filter: { ...state.filter, ...patch } })),
  resetFilter: () => set({ filter: EMPTY_ACTIVITY_FILTER }),
}));

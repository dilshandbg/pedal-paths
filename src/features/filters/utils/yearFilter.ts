import type { CyclingActivity } from '@/types';

/** The years that occur in the loaded rides, newest first: the year filter's options (ADR-0005). */
export function availableYears(activities: readonly CyclingActivity[]): readonly number[] {
  return [...new Set(activities.map((activity) => activity.year))].sort((a, b) => b - a);
}

/**
 * New year selection with `year` selected or deselected (BR-07). Kept sorted, newest first. Never
 * mutates the input, and returns it unchanged when the year is already in the requested state.
 * Deselecting the last year leaves the selection empty, which means all years (RULE-09).
 */
export function setYearSelected(
  selectedYears: readonly number[],
  year: number,
  selected: boolean,
): readonly number[] {
  const isSelected = selectedYears.includes(year);
  if (selected === isSelected) {
    return selectedYears;
  }
  return selected
    ? [...selectedYears, year].sort((a, b) => b - a)
    : selectedYears.filter((y) => y !== year);
}

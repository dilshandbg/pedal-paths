import type { Month } from '@/types';

/**
 * New month selection with `month` selected or deselected (BR-08). Kept in calendar order. Never
 * mutates the input, and returns it unchanged when the month is already in the requested state.
 * Deselecting the last month leaves the selection empty, which means all months (RULE-09).
 */
export function setMonthSelected(
  selectedMonths: readonly Month[],
  month: Month,
  selected: boolean,
): readonly Month[] {
  const isSelected = selectedMonths.includes(month);
  if (selected === isSelected) {
    return selectedMonths;
  }
  return selected
    ? [...selectedMonths, month].sort((a, b) => a - b)
    : selectedMonths.filter((m) => m !== month);
}

import type { Month } from '@/types';

export const MONTHS: readonly Month[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/** English name of a calendar month, 1 = "January". */
export function monthName(month: Month): string {
  // Safe: Month is 1..12, so the index is always 0..11.
  return MONTH_NAMES[month - 1] as string;
}

/** Type guard: true when `value` is an integer calendar month in 1..12. */
export function isMonth(value: number): value is Month {
  return Number.isInteger(value) && value >= 1 && value <= 12;
}

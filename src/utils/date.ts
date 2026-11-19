import type { Month } from '@/types';
import { isMonth } from '@/utils/month';

/**
 * Calendar year and month of a UTC instant in the given IANA time zone. When `timeZone` is
 * undefined, the runtime's local zone (the browser's) is used, as ADR-0007 specifies.
 * Returns null for an unparsable date.
 */
export function getYearMonth(
  isoDate: string,
  timeZone?: string,
): { readonly year: number; readonly month: Month } | null {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const parts = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'numeric',
    ...(timeZone === undefined ? {} : { timeZone }),
  }).formatToParts(date);

  const year = Number(parts.find((part) => part.type === 'year')?.value);
  const month = Number(parts.find((part) => part.type === 'month')?.value);
  return Number.isInteger(year) && isMonth(month) ? { year, month } : null;
}

/**
 * Short calendar date for display, such as "Nov 5, 2023", in the given IANA time zone or the
 * browser's local zone (ADR-0007). Returns an empty string for an unparsable date.
 */
export function formatShortDate(isoDate: string, timeZone?: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    ...(timeZone === undefined ? {} : { timeZone }),
  }).format(date);
}

/**
 * Date and time for display, such as "Nov 19, 2026, 10:05 AM", in the given IANA time zone or the
 * browser's local zone (ADR-0007). Returns an empty string for an unparsable date.
 */
export function formatDateTime(isoDate: string, timeZone?: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    ...(timeZone === undefined ? {} : { timeZone }),
  }).format(date);
}

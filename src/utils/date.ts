import type { Month } from '@/types';
// Relative, not `@/`: the local backend's analytics load this file without the alias (ADR-0013).
import { isMonth } from './month';

type FormatOptions = Omit<Intl.DateTimeFormatOptions, 'timeZone'>;
const formatters = new Map<string, Intl.DateTimeFormat>();

/**
 * A shared `en-US` formatter for these options and time zone (undefined = the runtime's zone).
 * Creating a formatter is slow; a history of thousands of rides formats thousands of dates
 * (NFR-10), so each distinct formatter is created once.
 */
export function dateFormatter(options: FormatOptions, timeZone?: string): Intl.DateTimeFormat {
  const key = `${timeZone ?? ''}|${JSON.stringify(options)}`;
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      ...options,
      ...(timeZone === undefined ? {} : { timeZone }),
    });
    formatters.set(key, formatter);
  }
  return formatter;
}

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

  const parts = dateFormatter({ year: 'numeric', month: 'numeric' }, timeZone).formatToParts(date);

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
  return dateFormatter({ dateStyle: 'medium' }, timeZone).format(date);
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
  return dateFormatter({ dateStyle: 'medium', timeStyle: 'short' }, timeZone).format(date);
}

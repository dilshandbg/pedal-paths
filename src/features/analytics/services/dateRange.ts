import type { DateRange } from '@/types';

/*
 * Date ranges of the analytics (BR-38). A ride belongs to the calendar date it started on in the
 * history's time zone, like the year and month filters (ADR-0007).
 *
 * Only relative and type-only imports: the local backend loads this file without the `@/` alias.
 */

export const ALL_TIME: DateRange = Object.freeze({ from: null, to: null });

/** `YYYY-MM-DD` of an instant in the given IANA time zone (default: the machine's). */
export function localDate(isoDate: string, timeZone?: string): string | null {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(timeZone === undefined ? {} : { timeZone }),
  }).formatToParts(date);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** Whether a `YYYY-MM-DD` date is in the range, both ends inclusive. */
export function isInRange(date: string, range: DateRange): boolean {
  return (range.from === null || date >= range.from) && (range.to === null || date <= range.to);
}

/** Whether a ride that started at `isoDate` falls in the range. */
export function startedInRange(isoDate: string, range: DateRange, timeZone?: string): boolean {
  const date = localDate(isoDate, timeZone);
  return date !== null && isInRange(date, range);
}

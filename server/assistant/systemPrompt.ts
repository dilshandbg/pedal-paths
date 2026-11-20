import { localDate } from '../../src/features/analytics/services/dateRange';
import type { AnalyticsRide } from '../../src/types/analytics';

/*
 * The assistant's instructions to the model (BR-39, RULE-25, ADR-0014 §5). The rules matter more
 * than the wording: numbers only from tools, say when the tools can't answer.
 */

export interface HistorySummary {
  readonly rideCount: number;
  /** `YYYY-MM-DD`, or null without rides. */
  readonly firstRideDate: string | null;
  readonly lastRideDate: string | null;
}

/** The size and span of the stored history, for the system prompt. */
export function summarizeHistory(
  rides: readonly AnalyticsRide[],
  timeZone?: string,
): HistorySummary {
  let first: string | null = null;
  let last: string | null = null;
  for (const ride of rides) {
    const day = localDate(ride.activityDate, timeZone);
    if (day === null) continue;
    if (first === null || day < first) first = day;
    if (last === null || day > last) last = day;
  }
  return { rideCount: rides.length, firstRideDate: first, lastRideDate: last };
}

export interface SystemPromptInput {
  /** `YYYY-MM-DD`. */
  readonly today: string;
  readonly timeZone: string;
  readonly history: HistorySummary;
}

// Implements: BR-39, RULE-25
export function buildSystemPrompt({ today, timeZone, history }: SystemPromptInput): string {
  const stored =
    history.rideCount === 0 || history.firstRideDate === null
      ? 'No rides are stored yet.'
      : `${history.rideCount} rides are stored, from ${history.firstRideDate} to ${history.lastRideDate}.`;
  return [
    "You are the ride assistant of a personal cycling app. You answer questions about the user's own stored rides.",
    '',
    'Rules:',
    "- Get every number about the user's rides from the tools. Call a tool before answering any question about distances, rides, elevation, time, places, roads or periods.",
    '- Use only numbers from tool results in this conversation. Never calculate, estimate, guess or invent ride statistics.',
    '- If the tools cannot answer a question (for example heart rate, power, speed, weather or segments), say so plainly and do not give numbers.',
    '- If a tool reports problems with its arguments, correct the arguments and call it again.',
    '- Places are given as latitude and longitude in decimal degrees. If the user names a place without coordinates, ask for the coordinates.',
    `- Dates are YYYY-MM-DD in the time zone ${timeZone}. Today is ${today}. A year means 1 January to 31 December.`,
    '- Use km, m and hours. Keep answers short, and say which period the numbers cover.',
    '',
    stored,
  ].join('\n');
}

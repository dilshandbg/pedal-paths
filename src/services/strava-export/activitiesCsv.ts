import { parseCsv } from './csv';

/** One row of Strava's `activities.csv`, reduced to the fields this app uses (DATA-03). */
export interface ActivityCsvRow {
  readonly activityId: string;
  /** Raw `Activity Date` value, e.g. `Nov 14, 2023, 7:12:45 AM` (UTC). */
  readonly activityDate: string;
  readonly activityName: string;
  /** Raw `Activity Type` value, e.g. `Ride`, `Run`, `Virtual Ride` (RULE-03). */
  readonly activityType: string;
  /** Distance in metres, or null when missing or not numeric. */
  readonly distanceMetres: number | null;
  /** Elevation gain in metres, or null when missing or not numeric. */
  readonly elevationGainMetres: number | null;
  /** Path of the GPS file inside the archive, e.g. `activities/123.fit.gz`; empty when none. */
  readonly fileName: string;
}

export class ActivitiesCsvFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ActivitiesCsvFormatError';
  }
}

const REQUIRED_HEADERS = ['Activity ID', 'Activity Type', 'Filename'] as const;

function parseNumber(value: string | undefined): number | null {
  if (value === undefined) {
    return null;
  }
  const trimmed = value.trim().replace(/,/g, '');
  if (trimmed === '') {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Parses Strava's `activities.csv`. Strava repeats some header names: `Distance` appears once in
 * the display unit (km or miles) and once later in metres. Columns are therefore resolved by
 * position. When `Distance` appears more than once, the **last** occurrence (metres) is used; a
 * single `Distance` column is treated as kilometres. Header names are assumed to be English (OD-23).
 *
 * @throws ActivitiesCsvFormatError when a required header is missing.
 */
export function parseActivitiesCsv(text: string): ActivityCsvRow[] {
  const [header, ...records] = parseCsv(text);
  if (!header) {
    throw new ActivitiesCsvFormatError('activities.csv is empty');
  }

  const names = header.map((name) => name.trim());
  for (const required of REQUIRED_HEADERS) {
    if (!names.includes(required)) {
      throw new ActivitiesCsvFormatError(`activities.csv has no "${required}" column`);
    }
  }

  const first = (name: string) => names.indexOf(name);
  const distanceIndexes = names.flatMap((name, index) => (name === 'Distance' ? [index] : []));
  const distanceIndex = distanceIndexes.at(-1);
  const distanceIsMetres = distanceIndexes.length > 1;

  const column = {
    id: first('Activity ID'),
    date: first('Activity Date'),
    name: first('Activity Name'),
    type: first('Activity Type'),
    elevationGain: first('Elevation Gain'),
    fileName: first('Filename'),
  };
  const cell = (record: readonly string[], index: number) =>
    index >= 0 ? (record[index] ?? '').trim() : '';

  return records
    .filter((record) => record.some((value) => value.trim() !== ''))
    .map((record) => {
      const rawDistance = distanceIndex === undefined ? null : parseNumber(record[distanceIndex]);
      return {
        activityId: cell(record, column.id),
        activityDate: cell(record, column.date),
        activityName: cell(record, column.name),
        activityType: cell(record, column.type),
        distanceMetres:
          rawDistance === null ? null : distanceIsMetres ? rawDistance : rawDistance * 1000,
        elevationGainMetres:
          column.elevationGain >= 0 ? parseNumber(record[column.elevationGain]) : null,
        fileName: cell(record, column.fileName),
      };
    });
}

const MONTH_INDEX: Readonly<Record<string, number>> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

const STRAVA_DATE =
  /^([A-Za-z]{3})[a-z]*\.? (\d{1,2}), (\d{4}),? (\d{1,2}):(\d{2}):(\d{2})\s*([AaPp][Mm])?$/;

/**
 * Parses Strava's `Activity Date` (UTC), e.g. `Nov 14, 2023, 7:12:45 AM`, into a UTC ISO 8601
 * string. Also accepts ISO 8601 input. Returns null when the value can't be parsed.
 */
export function parseStravaDate(value: string): string | null {
  const trimmed = value.trim();
  const match = STRAVA_DATE.exec(trimmed);

  if (match) {
    const [, mon, day, year, hour, minute, second, meridiem] = match;
    const month = MONTH_INDEX[(mon ?? '').toLowerCase()];
    if (month === undefined) {
      return null;
    }
    let hours = Number(hour);
    if (meridiem) {
      const isPm = meridiem.toLowerCase() === 'pm';
      if (hours < 1 || hours > 12) {
        return null;
      }
      hours = (hours % 12) + (isPm ? 12 : 0);
    }
    const date = new Date(
      Date.UTC(Number(year), month, Number(day), hours, Number(minute), Number(second)),
    );
    return Number.isNaN(date.getTime()) || date.getUTCDate() !== Number(day)
      ? null
      : date.toISOString();
  }

  // ISO 8601 only with an explicit zone, so it is never silently read as local time.
  if (/^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:?\d{2})$/.test(trimmed)) {
    const date = new Date(trimmed);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  return null;
}

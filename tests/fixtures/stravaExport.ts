/**
 * Builders for SYNTHETIC Strava export archives used by tests. Nothing here is real activity data:
 * coordinates are generated near 0°N 0°E.
 *
 * The CSV header mirrors the shape of Strava's real `activities.csv`, including its duplicate
 * `Distance` and `Elapsed Time` columns (first Distance in km, second in metres).
 */
import {
  Encoder,
  Profile,
  type FileIdMesg,
  type RecordMesg,
  type SessionMesg,
} from '@garmin/fitsdk';
import { gzipSync, strToU8, zipSync } from 'fflate';

export const STRAVA_CSV_HEADER = [
  'Activity ID',
  'Activity Date',
  'Activity Name',
  'Activity Type',
  'Activity Description',
  'Elapsed Time',
  'Distance',
  'Max Heart Rate',
  'Relative Effort',
  'Commute',
  'Activity Private Note',
  'Activity Gear',
  'Filename',
  'Athlete Weight',
  'Bike Weight',
  'Elapsed Time',
  'Moving Time',
  'Distance',
  'Max Speed',
  'Average Speed',
  'Elevation Gain',
  'Elevation Loss',
] as const;

export interface CsvActivity {
  readonly id: string;
  readonly date: string;
  readonly name: string;
  readonly type: string;
  readonly fileName: string;
  readonly distanceMetres?: number | null;
  readonly elevationGain?: number | null;
  readonly description?: string;
}

const quote = (value: string) =>
  /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

export function makeActivitiesCsv(activities: readonly CsvActivity[]): string {
  const lines = activities.map((activity) => {
    const metres = activity.distanceMetres ?? null;
    const cells: Record<number, string> = {
      0: activity.id,
      1: activity.date,
      2: activity.name,
      3: activity.type,
      4: activity.description ?? '',
      6: metres === null ? '' : (metres / 1000).toFixed(2),
      12: activity.fileName,
      17: metres === null ? '' : metres.toFixed(1),
      20:
        activity.elevationGain === undefined || activity.elevationGain === null
          ? ''
          : String(activity.elevationGain),
    };
    return STRAVA_CSV_HEADER.map((_, index) => quote(cells[index] ?? '')).join(',');
  });
  return [STRAVA_CSV_HEADER.join(','), ...lines].join('\n') + '\n';
}

export interface FixturePoint {
  readonly latitude: number;
  readonly longitude: number;
  readonly elevation?: number;
  readonly time: Date;
}

/** `count` points heading north from (lat, lon), ~`stepMetres` apart, one per 10 s. */
export function makeTrackPoints(
  count: number,
  {
    latitude = 0,
    longitude = 0,
    stepMetres = 100,
    start = new Date('2024-03-10T07:00:00Z'),
    elevation = 10,
  }: {
    latitude?: number;
    longitude?: number;
    stepMetres?: number;
    start?: Date;
    elevation?: number;
  } = {},
): FixturePoint[] {
  const degreesPerMetre = 1 / 111_195;
  return Array.from({ length: count }, (_, index) => ({
    latitude: latitude + index * stepMetres * degreesPerMetre,
    longitude,
    elevation: elevation + index,
    time: new Date(start.getTime() + index * 10_000),
  }));
}

export function makeGpx(points: readonly FixturePoint[], name = 'Synthetic Ride'): string {
  const trkpts = points
    .map(
      (point) =>
        `      <trkpt lat="${point.latitude.toFixed(7)}" lon="${point.longitude.toFixed(7)}">` +
        (point.elevation === undefined ? '' : `<ele>${point.elevation}</ele>`) +
        `<time>${point.time.toISOString()}</time></trkpt>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test fixture" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><time>${points[0]?.time.toISOString() ?? ''}</time></metadata>
  <trk>
    <name>${name}</name>
    <type>cycling</type>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>
`;
}

const SEMICIRCLES_PER_DEGREE = 2 ** 31 / 180;

/** Looks up a FIT message number by name, failing loudly if the SDK profile lacks it. */
export function mesgNum(name: string): number {
  const value = Profile.MesgNum[name];
  if (value === undefined) {
    throw new Error(`Unknown FIT message: ${name}`);
  }
  return value;
}

export const writeFileId = (encoder: Encoder, mesg: FileIdMesg) =>
  encoder.onMesg(mesgNum('FILE_ID'), mesg);
export const writeRecord = (encoder: Encoder, mesg: RecordMesg) =>
  encoder.onMesg(mesgNum('RECORD'), mesg);
export const writeSession = (encoder: Encoder, mesg: SessionMesg) =>
  encoder.onMesg(mesgNum('SESSION'), mesg);

export function makeFit(points: readonly FixturePoint[]): Uint8Array {
  const start = points[0]?.time ?? new Date('2024-03-10T07:00:00Z');
  const end = points.at(-1)?.time ?? start;
  const encoder = new Encoder();
  writeFileId(encoder, {
    type: 'activity',
    manufacturer: 'development',
    product: 0,
    serialNumber: 12345,
    timeCreated: start,
  });
  for (const point of points) {
    writeRecord(encoder, {
      timestamp: point.time,
      positionLat: Math.round(point.latitude * SEMICIRCLES_PER_DEGREE),
      positionLong: Math.round(point.longitude * SEMICIRCLES_PER_DEGREE),
      ...(point.elevation === undefined ? {} : { altitude: point.elevation }),
    });
  }
  writeSession(encoder, {
    timestamp: end,
    startTime: start,
    sport: 'cycling',
  });
  return encoder.close();
}

export const gzip = (data: string | Uint8Array): Uint8Array =>
  gzipSync(typeof data === 'string' ? strToU8(data) : data);

export function makeZip(entries: Readonly<Record<string, string | Uint8Array>>): Uint8Array {
  return zipSync(
    Object.fromEntries(
      Object.entries(entries).map(([path, data]) => [
        path,
        typeof data === 'string' ? strToU8(data) : data,
      ]),
    ),
  );
}

/** Streams `bytes` in chunks of `chunkSize`, like `File.stream()` does for large files. */
export function streamOf(bytes: Uint8Array, chunkSize = 64 * 1024): ReadableStream<Uint8Array> {
  let offset = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.length) {
        controller.close();
        return;
      }
      controller.enqueue(bytes.slice(offset, offset + chunkSize));
      offset += chunkSize;
    },
  });
}

/**
 * A realistic small export: 2 GPX rides (one gzipped), 1 gzipped FIT ride, a Run, a Ride without a
 * GPS file, a Ride with a TCX file, a Ride with a corrupt file, and unrelated media.
 */
export function makeSampleExport(): Uint8Array {
  const rideA = makeTrackPoints(30, { start: new Date('2023-11-05T08:00:00Z') });
  const rideB = makeTrackPoints(30, { start: new Date('2022-11-12T09:00:00Z'), longitude: 0.01 });
  const rideC = makeTrackPoints(30, { start: new Date('2023-06-01T06:30:00Z'), longitude: 0.02 });
  const run = makeTrackPoints(30, { start: new Date('2023-07-01T06:30:00Z') });

  const csv = makeActivitiesCsv([
    {
      id: '1001',
      date: 'Nov 5, 2023, 8:00:00 AM',
      name: 'Morning Ride, with "quotes"',
      type: 'Ride',
      fileName: 'activities/1001.gpx',
      distanceMetres: 2900,
      elevationGain: 29,
      description: 'Line one\nLine two, with comma',
    },
    {
      id: '1002',
      date: 'Nov 12, 2022, 9:00:00 AM',
      name: 'Lunch Ride',
      type: 'Ride',
      fileName: 'activities/1002.gpx.gz',
      distanceMetres: 2900,
      elevationGain: 29,
    },
    {
      id: '1003',
      date: 'Jun 1, 2023, 6:30:00 AM',
      name: 'FIT Ride',
      type: 'Ride',
      fileName: 'activities/1003.fit.gz',
      distanceMetres: null,
      elevationGain: null,
    },
    {
      id: '2001',
      date: 'Jul 1, 2023, 6:30:00 AM',
      name: 'Morning Run',
      type: 'Run',
      fileName: 'activities/2001.gpx',
      distanceMetres: 2900,
    },
    {
      id: '1004',
      date: 'Jan 2, 2024, 5:00:00 PM',
      name: 'Trainer Ride',
      type: 'Ride',
      fileName: '',
    },
    {
      id: '1005',
      date: 'Feb 3, 2024, 5:00:00 PM',
      name: 'TCX Ride',
      type: 'Ride',
      fileName: 'activities/1005.tcx.gz',
    },
    {
      id: '1006',
      date: 'Mar 4, 2024, 5:00:00 PM',
      name: 'Broken Ride',
      type: 'Ride',
      fileName: 'activities/1006.fit',
    },
    {
      id: '3001',
      date: 'Mar 5, 2024, 5:00:00 PM',
      name: 'Zwift',
      type: 'Virtual Ride',
      fileName: 'activities/3001.fit.gz',
    },
  ]);

  return makeZip({
    'activities.csv': csv,
    'activities/1001.gpx': makeGpx(rideA, 'Morning Ride'),
    'activities/1002.gpx.gz': gzip(makeGpx(rideB, 'Lunch Ride')),
    'activities/1003.fit.gz': gzip(makeFit(rideC)),
    'activities/2001.gpx': makeGpx(run, 'Morning Run'),
    'activities/1005.tcx.gz': gzip('<TrainingCenterDatabase/>'),
    'activities/1006.fit': strToU8('this is not a fit file'),
    'activities/3001.fit.gz': gzip(makeFit(rideC)),
    'profile.csv': 'Athlete ID\n1\n',
    'media/photo.jpg': new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]),
  });
}

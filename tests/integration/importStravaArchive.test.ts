// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  detectGpsFormat,
  importStravaArchive,
} from '@/features/activities/services/importStravaArchive';
import type { ImportResult, ImportStatus } from '@/types';
import {
  makeActivitiesCsv,
  makeGpx,
  makeSampleExport,
  makeTrackPoints,
  makeZip,
  streamOf,
} from '../fixtures/stravaExport';

const runImport = (zip: Uint8Array, onStatus?: (status: ImportStatus) => void) =>
  importStravaArchive(streamOf(zip, 4096), {
    timeZone: 'UTC',
    ...(onStatus ? { onStatus } : {}),
  });

function expectOk(result: ImportResult): Extract<ImportResult, { ok: true }> {
  if (!result.ok) {
    throw new Error(`Expected a successful import, got ${result.reason}`);
  }
  return result;
}

describe('importStravaArchive: sample Strava export', () => {
  it('AC-02 / AC-03 / AC-05: processes the ZIP and loads GPX, GPX.gz and FIT.gz rides', async () => {
    const result = expectOk(await runImport(makeSampleExport()));

    // Sorted newest first.
    expect(result.activities.map((a) => [a.activityId, a.year, a.month])).toEqual([
      ['1001', 2023, 11],
      ['1003', 2023, 6],
      ['1002', 2022, 11],
    ]);
    for (const activity of result.activities) {
      expect(activity.gpsTrack).toHaveLength(30);
    }
  });

  it('AC-04: excludes the Run and the Virtual Ride', async () => {
    const result = expectOk(await runImport(makeSampleExport()));

    expect(result.excludedNonRideCount).toBe(2);
    const ids = result.activities.map((a) => a.activityId);
    expect(ids).not.toContain('2001');
    expect(ids).not.toContain('3001');
  });

  it('DATA-05 / UX-04: reports rides it could not process without aborting the import', async () => {
    const result = expectOk(await runImport(makeSampleExport()));

    expect(result.issues).toEqual([
      {
        activityId: '1004',
        activityName: 'Trainer Ride',
        fileName: null,
        reason: 'missing-gps-file',
      },
      {
        activityId: '1005',
        activityName: 'TCX Ride',
        fileName: 'activities/1005.tcx.gz',
        reason: 'unsupported-format',
      },
      {
        activityId: '1006',
        activityName: 'Broken Ride',
        fileName: 'activities/1006.fit',
        reason: 'malformed-file',
      },
    ]);
  });

  it('BR-13: keeps Strava’s metrics from the CSV, computing them only when missing', async () => {
    const result = expectOk(await runImport(makeSampleExport()));
    const byId = new Map(result.activities.map((a) => [a.activityId, a]));

    expect(byId.get('1001')).toMatchObject({
      activityName: 'Morning Ride, with "quotes"',
      distanceKm: 2.9,
      elevationGainM: 29,
    });
    // 1003 has no CSV metrics: 29 steps of 100 m and +1 m/point elevation (below threshold).
    expect(byId.get('1003')?.distanceKm).toBeCloseTo(2.9, 1);
    expect(byId.get('1003')?.elevationGainM).toBe(27);
  });

  it('UX-02: reports progress from reading through to the last ride', async () => {
    const statuses: ImportStatus[] = [];
    await runImport(makeSampleExport(), (status) => statuses.push(status));

    expect(statuses[0]).toEqual({ stage: 'reading-archive' });
    // The heat map index is built later, over the whole stored history (ADR-0013 §4).
    expect(statuses.at(-1)).toEqual({ stage: 'parsing-activities', processed: 6, total: 6 });
  });

  it('BR-18 / AC-18: ignores a duplicated activity row', async () => {
    const track = makeTrackPoints(5);
    const csvRow = {
      id: '1',
      date: 'Jan 1, 2024, 8:00:00 AM',
      name: 'Ride',
      type: 'Ride',
      fileName: 'activities/1.gpx',
    };
    const zip = makeZip({
      'activities.csv': makeActivitiesCsv([csvRow, csvRow]),
      'activities/1.gpx': makeGpx(track),
    });

    const result = expectOk(await runImport(zip));
    expect(result.activities).toHaveLength(1);
  });
});

describe('importStravaArchive: AC-16 unusable archives', () => {
  it('rejects a file that is not a ZIP', async () => {
    const text = new TextEncoder().encode('Activity ID,Activity Type\n1,Ride\n');
    expect(await runImport(text)).toEqual({ ok: false, reason: 'not-a-zip' });
  });

  it('rejects a ZIP without activities.csv', async () => {
    const zip = makeZip({ 'activities/1.gpx': makeGpx(makeTrackPoints(5)) });
    expect(await runImport(zip)).toEqual({ ok: false, reason: 'missing-activities-csv' });
  });

  it('rejects an activities.csv without the required columns', async () => {
    const zip = makeZip({ 'activities.csv': 'Something,Else\n1,2\n' });
    expect(await runImport(zip)).toEqual({ ok: false, reason: 'missing-activities-csv' });
  });

  it('rejects an export with no Ride that has GPS data', async () => {
    const zip = makeZip({
      'activities.csv': makeActivitiesCsv([
        {
          id: '1',
          date: 'Jan 1, 2024, 8:00:00 AM',
          name: 'Run',
          type: 'Run',
          fileName: 'activities/1.gpx',
        },
        { id: '2', date: 'Jan 2, 2024, 8:00:00 AM', name: 'Indoor', type: 'Ride', fileName: '' },
      ]),
      'activities/1.gpx': makeGpx(makeTrackPoints(5)),
    });
    expect(await runImport(zip)).toEqual({ ok: false, reason: 'no-eligible-rides' });
  });
});

describe('detectGpsFormat', () => {
  it.each([
    ['activities/1.gpx', 'gpx'],
    ['activities/1.GPX.gz', 'gpx'],
    ['activities/1.fit', 'fit'],
    ['activities/1.fit.gz', 'fit'],
    ['activities/1.tcx.gz', null],
    ['activities/1.gz', null],
  ])('%s → %s', (fileName, expected) => {
    expect(detectGpsFormat(fileName)).toBe(expected);
  });
});

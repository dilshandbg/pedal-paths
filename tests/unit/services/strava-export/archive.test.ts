// @vitest-environment node
import { strFromU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  CorruptArchiveError,
  NotAZipError,
  decompressActivityFile,
  readStravaArchive,
} from '@/services/strava-export/archive';
import { gzip, makeZip, streamOf } from '../../../fixtures/stravaExport';

describe('readStravaArchive', () => {
  it('BR-02: extracts activities.csv and activity files, skipping everything else', async () => {
    const zip = makeZip({
      'activities.csv': 'Activity ID\n1\n',
      'activities/1.gpx': '<gpx/>',
      'activities/2.fit.gz': gzip('fit'),
      'media/photo.jpg': new Uint8Array([1, 2, 3]),
      'profile.csv': 'x',
    });

    const contents = await readStravaArchive(streamOf(zip));

    expect(contents.activitiesCsv).toBe('Activity ID\n1\n');
    expect([...contents.activityFiles.keys()].sort()).toEqual([
      'activities/1.gpx',
      'activities/2.fit.gz',
    ]);
  });

  it('reads archives delivered in many small chunks', async () => {
    const big = 'x'.repeat(200_000);
    const zip = makeZip({ 'activities.csv': big, 'activities/1.gpx': '<gpx/>' });

    const contents = await readStravaArchive(streamOf(zip, 1024));

    expect(contents.activitiesCsv).toHaveLength(200_000);
  });

  it('accepts an export wrapped in a single top-level folder', async () => {
    const zip = makeZip({
      'export_123/activities.csv': 'csv',
      'export_123/activities/9.gpx': '<gpx/>',
    });

    const contents = await readStravaArchive(streamOf(zip));

    expect(contents.activitiesCsv).toBe('csv');
    expect(contents.activityFiles.has('activities/9.gpx')).toBe(true);
  });

  it('reports a missing activities.csv as null', async () => {
    const contents = await readStravaArchive(streamOf(makeZip({ 'other.txt': 'x' })));
    expect(contents.activitiesCsv).toBeNull();
    expect(contents.activityFiles.size).toBe(0);
  });

  it('AC-16: rejects data that is not a ZIP', async () => {
    const notZip = new TextEncoder().encode('just some text, definitely not a zip file');
    await expect(readStravaArchive(streamOf(notZip))).rejects.toBeInstanceOf(NotAZipError);
  });

  it('AC-16: rejects an empty file', async () => {
    await expect(readStravaArchive(streamOf(new Uint8Array(0)))).rejects.toBeInstanceOf(
      NotAZipError,
    );
  });

  it('AC-16: rejects a ZIP whose compressed data is corrupt', async () => {
    const zip = makeZip({ 'activities.csv': 'a'.repeat(10_000) });
    const corrupt = zip.slice();
    // Overwrite the deflate stream just after the 30-byte local header + file name.
    corrupt.fill(0xff, 50, 120);

    await expect(readStravaArchive(streamOf(corrupt))).rejects.toBeInstanceOf(CorruptArchiveError);
  });
});

describe('decompressActivityFile', () => {
  it('gunzips .gz files', () => {
    expect(strFromU8(decompressActivityFile('activities/1.gpx.GZ', gzip('<gpx/>')))).toBe('<gpx/>');
  });

  it('returns other files unchanged', () => {
    const bytes = new Uint8Array([1, 2, 3]);
    expect(decompressActivityFile('activities/1.fit', bytes)).toBe(bytes);
  });
});

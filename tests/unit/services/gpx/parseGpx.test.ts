// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { GpxFormatError, parseGpx } from '@/services/gpx/parseGpx';
import minimalRideGpx from '../../../fixtures/gpx/minimal-ride.gpx?raw';
import { makeGpx, makeTrackPoints } from '../../../fixtures/stravaExport';

describe('parseGpx', () => {
  it('BR-05: reads the committed synthetic fixture', () => {
    const track = parseGpx(minimalRideGpx);

    expect(track.name).toBe('Synthetic Morning Ride');
    expect(track.startTime).toBe('2024-03-10T07:00:00.000Z');
    expect(track.points).toEqual([
      { latitude: 0, longitude: 0, elevation: 10, timestamp: '2024-03-10T07:00:00.000Z' },
      { latitude: 0.008993, longitude: 0, elevation: 15, timestamp: '2024-03-10T07:02:00.000Z' },
      { latitude: 0.017986, longitude: 0, elevation: 12, timestamp: '2024-03-10T07:04:00.000Z' },
    ]);
  });

  it('reads generated tracks of any length', () => {
    const points = makeTrackPoints(500);
    const track = parseGpx(makeGpx(points, 'Long &amp; winding'));

    expect(track.points).toHaveLength(500);
    expect(track.name).toBe('Long & winding');
  });

  it('accepts self-closing points, single-quoted and reordered attributes, and route points', () => {
    const text = `<gpx><rte><rtept lon='1.5' lat='2.5'/></rte><trk><trkseg>
      <trkpt lon="3" lat="4"/></trkseg></trk></gpx>`;

    expect(parseGpx(text).points).toEqual([
      { latitude: 2.5, longitude: 1.5, elevation: null, timestamp: null },
      { latitude: 4, longitude: 3, elevation: null, timestamp: null },
    ]);
  });

  it('accepts namespace-prefixed elements', () => {
    const text = `<gpx:gpx xmlns:gpx="http://www.topografix.com/GPX/1/1"><gpx:trk><gpx:trkseg>
      <gpx:trkpt lat="1" lon="2"><gpx:ele>5</gpx:ele></gpx:trkpt></gpx:trkseg></gpx:trk></gpx:gpx>`;

    expect(parseGpx(text).points).toEqual([
      { latitude: 1, longitude: 2, elevation: 5, timestamp: null },
    ]);
  });

  it('drops points with missing or out-of-range coordinates', () => {
    const text = `<gpx><trk><trkseg>
      <trkpt lat="91" lon="0"/><trkpt lat="0" lon="181"/><trkpt lat="abc" lon="0"/>
      <trkpt lon="0"/><trkpt lat="1" lon="1"/></trkseg></trk></gpx>`;

    expect(parseGpx(text).points).toEqual([
      { latitude: 1, longitude: 1, elevation: null, timestamp: null },
    ]);
  });

  it('falls back to the first point time when there is no metadata time', () => {
    const text = `<gpx><trk><name>No meta</name><trkseg>
      <trkpt lat="1" lon="1"/><trkpt lat="1" lon="1"><time>2020-05-01T10:00:00Z</time></trkpt>
      </trkseg></trk></gpx>`;

    const track = parseGpx(text);
    expect(track.startTime).toBe('2020-05-01T10:00:00.000Z');
    expect(track.name).toBe('No meta');
  });

  it('returns null name and start time when the file has neither', () => {
    const track = parseGpx('<gpx><trk><trkseg><trkpt lat="1" lon="1"/></trkseg></trk></gpx>');
    expect(track.name).toBeNull();
    expect(track.startTime).toBeNull();
  });

  it.each(['', 'not xml at all', '<TrainingCenterDatabase/>'])(
    'rejects non-GPX input %j',
    (text) => {
      expect(() => parseGpx(text)).toThrow(GpxFormatError);
    },
  );
});

// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  decodeTrack,
  encodeTrack,
  TrackFormatError,
  trackPointCount,
} from '@/services/ride-history/trackCodec';
import type { GPSPoint } from '@/types';

const point = (patch: Partial<GPSPoint> = {}): GPSPoint => ({
  latitude: 51.5007292,
  longitude: -0.1246254,
  elevation: 12.5,
  timestamp: '2024-03-10T07:00:00.000Z',
  ...patch,
});

describe('BR-33: GPS track encoding', () => {
  it('round-trips coordinates, elevation and time', () => {
    const track = [
      point(),
      point({ latitude: 51.5017, longitude: -0.1236, elevation: 14, timestamp: '2024-03-10T07:00:05.250Z' }),
    ];

    expect(decodeTrack(encodeTrack(track))).toEqual(track);
  });

  it('keeps missing elevation and time as null', () => {
    const track = [point({ elevation: null, timestamp: null }), point({ elevation: 0 })];

    expect(decodeTrack(encodeTrack(track))).toEqual(track);
  });

  it('keeps coordinates to about 1 cm', () => {
    const [decoded] = decodeTrack(encodeTrack([point({ latitude: 12.345678912, longitude: 98.76543219 })]));

    expect(decoded?.latitude).toBeCloseTo(12.345678912, 7);
    expect(decoded?.longitude).toBeCloseTo(98.76543219, 7);
  });

  it('keeps the instant of a timestamp in another notation', () => {
    const [decoded] = decodeTrack(encodeTrack([point({ timestamp: '2024-03-10T09:00:00+02:00' })]));

    expect(decoded?.timestamp).toBe('2024-03-10T07:00:00.000Z');
  });

  it('encodes the extreme coordinates and an empty track', () => {
    const edges = [
      point({ latitude: 90, longitude: 180 }),
      point({ latitude: -90, longitude: -180 }),
    ];

    expect(decodeTrack(encodeTrack(edges)).map((p) => [p.latitude, p.longitude])).toEqual([
      [90, 180],
      [-90, -180],
    ]);
    expect(decodeTrack(encodeTrack([]))).toEqual([]);
  });

  it('uses 20 bytes per point plus an 8-byte header', () => {
    const bytes = encodeTrack([point(), point(), point()]);

    expect(bytes.byteLength).toBe(8 + 3 * 20);
    expect(trackPointCount(bytes)).toBe(3);
  });

  it('decodes a track that is a view into a larger buffer', () => {
    const encoded = encodeTrack([point(), point({ latitude: 1 })]);
    const larger = new Uint8Array(encoded.byteLength + 5);
    larger.set(encoded, 3);

    expect(decodeTrack(larger.subarray(3, 3 + encoded.byteLength))).toEqual(decodeTrack(encoded));
  });

  it('refuses to encode an invalid coordinate', () => {
    expect(() => encodeTrack([point({ latitude: 91 })])).toThrow(RangeError);
    expect(() => encodeTrack([point({ longitude: Number.NaN })])).toThrow(RangeError);
  });

  it('rejects bytes that are not a track', () => {
    const valid = encodeTrack([point()]);
    const wrongVersion = valid.slice();
    wrongVersion[0] = 2;

    expect(() => decodeTrack(new Uint8Array(4))).toThrow(TrackFormatError);
    expect(() => decodeTrack(wrongVersion)).toThrow(/version 2/);
    expect(() => decodeTrack(valid.subarray(0, valid.byteLength - 1))).toThrow(TrackFormatError);
  });

  it('rejects a decoded coordinate outside the valid range', () => {
    const bytes = encodeTrack([point()]);
    new DataView(bytes.buffer).setInt32(8, 950_000_000, true); // latitude 95°

    expect(() => decodeTrack(bytes)).toThrow(/invalid coordinates/);
  });
});

// @vitest-environment node
import { Encoder } from '@garmin/fitsdk';
import { describe, expect, it } from 'vitest';
import { FitFormatError, parseFit, semicirclesToDegrees } from '@/services/fit/parseFit';
import { makeFit, makeTrackPoints, writeFileId, writeRecord } from '../../../fixtures/stravaExport';

describe('semicirclesToDegrees', () => {
  it('maps 2^31 semicircles to 180 degrees', () => {
    expect(semicirclesToDegrees(2 ** 31)).toBe(180);
    expect(semicirclesToDegrees(-(2 ** 30))).toBe(-90);
    expect(semicirclesToDegrees(0)).toBe(0);
  });
});

describe('parseFit', () => {
  it('BR-05: reads positions, altitude and timestamps from record messages', () => {
    const points = makeTrackPoints(20, { latitude: 51.5, longitude: -0.12 });

    const track = parseFit(makeFit(points));

    expect(track.points).toHaveLength(20);
    const [first] = track.points;
    expect(first?.latitude).toBeCloseTo(51.5, 6);
    expect(first?.longitude).toBeCloseTo(-0.12, 6);
    expect(first?.elevation).toBeCloseTo(10, 1);
    expect(first?.timestamp).toBe('2024-03-10T07:00:00.000Z');
    expect(track.startTime).toBe('2024-03-10T07:00:00.000Z');
    expect(track.name).toBeNull();
  });

  it('skips records without a position (e.g. before GPS lock)', () => {
    const encoder = new Encoder();
    writeFileId(encoder, {
      type: 'activity',
      manufacturer: 'development',
      product: 0,
      timeCreated: new Date('2024-01-01T00:00:00Z'),
    });
    writeRecord(encoder, {
      timestamp: new Date('2024-01-01T00:00:00Z'),
      altitude: 100,
    });
    writeRecord(encoder, {
      timestamp: new Date('2024-01-01T00:00:10Z'),
      positionLat: 2 ** 29, // 45°
      positionLong: 2 ** 28, // 22.5°
    });

    const track = parseFit(encoder.close());

    expect(track.points).toEqual([
      { latitude: 45, longitude: 22.5, elevation: null, timestamp: '2024-01-01T00:00:10.000Z' },
    ]);
    expect(track.startTime).toBe('2024-01-01T00:00:10.000Z');
  });

  it.each([
    ['random bytes', new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14])],
    ['text', new TextEncoder().encode('this is not a fit file')],
    ['empty', new Uint8Array(0)],
  ])('rejects %s', (_label, bytes) => {
    expect(() => parseFit(bytes)).toThrow(FitFormatError);
  });
});

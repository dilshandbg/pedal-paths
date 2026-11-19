// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  decodeRideBundle,
  encodeRideBundle,
  RideBundleError,
} from '@/services/ride-history/rideBundle';
import type { EncodedRide } from '@/types';

const ride = (activityId: string, track: number[]): EncodedRide => ({
  details: {
    activityId,
    activityName: `Ride ${activityId}`,
    activityDate: '2024-03-10T07:00:00.000Z',
    distanceKm: 12.5,
    elevationGainM: null,
    movingTimeS: 1800,
  },
  track: Uint8Array.from(track),
});

const prefixAndHeader = (header: unknown): Uint8Array => {
  const json = new TextEncoder().encode(JSON.stringify(header));
  const bytes = new Uint8Array(8 + json.byteLength);
  bytes.set([0x50, 0x50, 0x52, 0x42]);
  new DataView(bytes.buffer).setUint32(4, json.byteLength, true);
  bytes.set(json, 8);
  return bytes;
};

describe('BR-33: ride bundle', () => {
  it('round-trips meta, ride details and track bytes in order', () => {
    const rides = [ride('1', [1, 2, 3]), ride('2', []), ride('3', [9])];

    const decoded = decodeRideBundle(encodeRideBundle({ upload: { fileName: 'a.zip' } }, rides));

    expect(decoded.meta).toEqual({ upload: { fileName: 'a.zip' } });
    expect(decoded.rides.map((r) => r.details)).toEqual(rides.map((r) => r.details));
    expect(decoded.rides.map((r) => [...r.track])).toEqual([[1, 2, 3], [], [9]]);
  });

  it('encodes a bundle without rides', () => {
    expect(decodeRideBundle(encodeRideBundle(null, [])).rides).toEqual([]);
  });

  it('rejects bytes that are not a bundle', () => {
    expect(() => decodeRideBundle(new Uint8Array(3))).toThrow(RideBundleError);
    expect(() => decodeRideBundle(new TextEncoder().encode('PK\u0003\u0004....'))).toThrow(
      /Not a ride bundle/,
    );
  });

  it('rejects a truncated or invalid header', () => {
    const valid = encodeRideBundle(null, [ride('1', [1])]);
    const bad = prefixAndHeader({});
    bad[8] = 0xff; // not UTF-8 JSON

    expect(() => decodeRideBundle(valid.subarray(0, 12))).toThrow(/truncated/);
    expect(() => decodeRideBundle(bad)).toThrow(/not valid JSON/);
    expect(() => decodeRideBundle(prefixAndHeader({ version: 2, rides: [] }))).toThrow(
      /Unsupported/,
    );
    expect(() => decodeRideBundle(prefixAndHeader({ version: 1, rides: [5] }))).toThrow(
      /not an object/,
    );
  });

  it('rejects track lengths that do not match the bytes', () => {
    const missing = prefixAndHeader({ version: 1, rides: [{ activityId: '1', trackBytes: 4 }] });
    const negative = prefixAndHeader({ version: 1, rides: [{ activityId: '1', trackBytes: -1 }] });
    const valid = encodeRideBundle(null, [ride('1', [1])]);
    const trailing = new Uint8Array(valid.byteLength + 1);
    trailing.set(valid);

    expect(() => decodeRideBundle(missing)).toThrow(/invalid track length/);
    expect(() => decodeRideBundle(negative)).toThrow(/invalid track length/);
    expect(() => decodeRideBundle(trailing)).toThrow(/trailing bytes/);
  });
});

import type { EncodedRide } from '@/types';

/*
 * One binary message holding many rides (ADR-0013 §4): `POST /api/uploads` sends an upload's
 * rides, and `GET /api/rides` returns the stored history. JSON for details, raw bytes for tracks,
 * so tracks are never expanded to text:
 *
 *   "PPRB" · u32 LE header length h · h bytes UTF-8 JSON header · track bytes, back to back
 *
 * Header: `{ "version": 1, "meta": <any>, "rides": [{ ...details, "trackBytes": <length> }] }`.
 *
 * Only relative and type-only imports: the local backend loads this file without the `@/` alias.
 */

export const RIDE_BUNDLE_VERSION = 1;
const MAGIC = [0x50, 0x50, 0x52, 0x42]; // "PPRB"
const PREFIX_BYTES = 8;

/** The bytes are not a ride bundle of a supported version. */
export class RideBundleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RideBundleError';
  }
}

/** A decoded bundle. Details are unchecked: the receiver validates them. */
export interface DecodedRideBundle {
  readonly meta: unknown;
  readonly rides: readonly { readonly details: unknown; readonly track: Uint8Array }[];
}

export function encodeRideBundle(meta: unknown, rides: readonly EncodedRide[]): Uint8Array {
  const header = {
    version: RIDE_BUNDLE_VERSION,
    meta,
    rides: rides.map((ride) => ({ ...ride.details, trackBytes: ride.track.byteLength })),
  };
  const headerBytes = new TextEncoder().encode(JSON.stringify(header));
  const trackBytes = rides.reduce((sum, ride) => sum + ride.track.byteLength, 0);

  const bytes = new Uint8Array(PREFIX_BYTES + headerBytes.byteLength + trackBytes);
  bytes.set(MAGIC, 0);
  new DataView(bytes.buffer).setUint32(4, headerBytes.byteLength, true);
  bytes.set(headerBytes, PREFIX_BYTES);
  let offset = PREFIX_BYTES + headerBytes.byteLength;
  for (const ride of rides) {
    bytes.set(ride.track, offset);
    offset += ride.track.byteLength;
  }
  return bytes;
}

/**
 * Splits a bundle into its meta, ride details and track bytes. Track bytes are views into `bytes`.
 *
 * @throws RideBundleError when the structure is invalid.
 */
export function decodeRideBundle(bytes: Uint8Array): DecodedRideBundle {
  if (bytes.byteLength < PREFIX_BYTES || MAGIC.some((byte, i) => bytes[i] !== byte)) {
    throw new RideBundleError('Not a ride bundle.');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const headerLength = view.getUint32(4, true);
  if (PREFIX_BYTES + headerLength > bytes.byteLength) {
    throw new RideBundleError('Ride bundle header is truncated.');
  }

  let header: unknown;
  try {
    header = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(
        bytes.subarray(PREFIX_BYTES, PREFIX_BYTES + headerLength),
      ),
    );
  } catch {
    throw new RideBundleError('Ride bundle header is not valid JSON.');
  }
  if (!isRecord(header) || header.version !== RIDE_BUNDLE_VERSION || !Array.isArray(header.rides)) {
    throw new RideBundleError('Unsupported ride bundle header.');
  }

  let offset = PREFIX_BYTES + headerLength;
  const rides = header.rides.map((entry: unknown, index) => {
    if (!isRecord(entry)) {
      throw new RideBundleError(`Ride ${index} is not an object.`);
    }
    const { trackBytes, ...details } = entry;
    if (
      typeof trackBytes !== 'number' ||
      !Number.isSafeInteger(trackBytes) ||
      trackBytes < 0 ||
      offset + trackBytes > bytes.byteLength
    ) {
      throw new RideBundleError(`Ride ${index} has an invalid track length.`);
    }
    const track = bytes.subarray(offset, offset + trackBytes);
    offset += trackBytes;
    return { details: details as unknown, track };
  });
  if (offset !== bytes.byteLength) {
    throw new RideBundleError('Ride bundle has trailing bytes.');
  }
  return { meta: header.meta, rides };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

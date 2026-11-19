import type { GPSPoint } from '@/types';
import { isValidLatitude, isValidLongitude } from '../../utils/geo';

/*
 * Compact binary encoding of one ride's GPS track (ADR-0013 §3), used in the ride database and
 * between the browser and the local backend. Little-endian, read with DataView so it does not
 * depend on the platform or on alignment:
 *
 *   u8 version (1) · u8[3] reserved (0) · u32 point count n
 *   i32[n] latitude × 10⁷ · i32[n] longitude × 10⁷ · f32[n] elevation m (NaN = none)
 *   f64[n] time, ms since 1970 UTC (NaN = none)
 *
 * Coordinates keep ~1 cm, so a decoded track draws and measures like the parsed one. Timestamps
 * keep their instant (millisecond precision) and come back in `toISOString()` form.
 *
 * Only relative and type-only imports: the local backend loads this file without the `@/` alias.
 */

export const TRACK_FORMAT_VERSION = 1;
const HEADER_BYTES = 8;
const BYTES_PER_POINT = 20;
const COORDINATE_SCALE = 1e7;

/** The bytes are not a track of a supported version. */
export class TrackFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TrackFormatError';
  }
}

/** Encodes a track. Points must have valid coordinates (as parsed tracks do). */
export function encodeTrack(points: readonly GPSPoint[]): Uint8Array {
  const count = points.length;
  const bytes = new Uint8Array(HEADER_BYTES + BYTES_PER_POINT * count);
  const view = new DataView(bytes.buffer);
  view.setUint8(0, TRACK_FORMAT_VERSION);
  view.setUint32(4, count, true);

  const latOffset = HEADER_BYTES;
  const lngOffset = latOffset + 4 * count;
  const eleOffset = lngOffset + 4 * count;
  const timeOffset = eleOffset + 4 * count;
  points.forEach((point, i) => {
    if (!isValidLatitude(point.latitude) || !isValidLongitude(point.longitude)) {
      throw new RangeError(`Track point ${i} has invalid coordinates.`);
    }
    view.setInt32(latOffset + 4 * i, Math.round(point.latitude * COORDINATE_SCALE), true);
    view.setInt32(lngOffset + 4 * i, Math.round(point.longitude * COORDINATE_SCALE), true);
    view.setFloat32(eleOffset + 4 * i, point.elevation ?? Number.NaN, true);
    const time = point.timestamp === null ? Number.NaN : Date.parse(point.timestamp);
    view.setFloat64(timeOffset + 8 * i, time, true);
  });
  return bytes;
}

/** Number of points in an encoded track, from its header. */
export function trackPointCount(bytes: Uint8Array): number {
  return readHeader(bytes);
}

/**
 * Decodes a track.
 *
 * @throws TrackFormatError when the version, length or a coordinate is invalid.
 */
export function decodeTrack(bytes: Uint8Array): GPSPoint[] {
  const count = readHeader(bytes);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const latOffset = HEADER_BYTES;
  const lngOffset = latOffset + 4 * count;
  const eleOffset = lngOffset + 4 * count;
  const timeOffset = eleOffset + 4 * count;

  const points: GPSPoint[] = new Array<GPSPoint>(count);
  for (let i = 0; i < count; i += 1) {
    const latitude = view.getInt32(latOffset + 4 * i, true) / COORDINATE_SCALE;
    const longitude = view.getInt32(lngOffset + 4 * i, true) / COORDINATE_SCALE;
    if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) {
      throw new TrackFormatError(`Track point ${i} has invalid coordinates.`);
    }
    const elevation = view.getFloat32(eleOffset + 4 * i, true);
    const time = view.getFloat64(timeOffset + 8 * i, true);
    const date = Number.isFinite(time) ? new Date(time) : null;
    points[i] = {
      latitude,
      longitude,
      elevation: Number.isFinite(elevation) ? elevation : null,
      timestamp: date !== null && !Number.isNaN(date.getTime()) ? date.toISOString() : null,
    };
  }
  return points;
}

function readHeader(bytes: Uint8Array): number {
  if (bytes.byteLength < HEADER_BYTES) {
    throw new TrackFormatError('Track is too short.');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint8(0);
  if (version !== TRACK_FORMAT_VERSION) {
    throw new TrackFormatError(`Unsupported track format version ${version}.`);
  }
  const count = view.getUint32(4, true);
  if (bytes.byteLength !== HEADER_BYTES + BYTES_PER_POINT * count) {
    throw new TrackFormatError('Track length does not match its point count.');
  }
  return count;
}

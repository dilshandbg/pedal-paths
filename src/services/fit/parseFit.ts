import { Decoder, Stream } from '@garmin/fitsdk';
import type { ParsedTrack } from '@/services/gpx/parseGpx';
import type { GPSPoint } from '@/types';
import { isValidLatitude, isValidLongitude } from '@/utils/geo';

export class FitFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FitFormatError';
  }
}

/** FIT stores positions as signed 32-bit "semicircles": 2^31 semicircles = 180°. */
const DEGREES_PER_SEMICIRCLE = 180 / 2 ** 31;

export const semicirclesToDegrees = (semicircles: number): number =>
  semicircles * DEGREES_PER_SEMICIRCLE;

function toIso(value: unknown): string | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  return null;
}

function finiteOrNull(value: number | undefined): number | null {
  return value !== undefined && Number.isFinite(value) ? value : null;
}

/**
 * Parses a FIT activity file into a track (BR-05) using Garmin's official SDK. Records without a
 * position (e.g. before GPS lock, or indoor rides) are skipped. Integrity (CRC) problems are
 * tolerated as long as records can be decoded, because truncated files still hold useful tracks.
 *
 * @throws FitFormatError when the bytes are not a FIT file or no messages can be decoded.
 */
export function parseFit(bytes: Uint8Array): ParsedTrack {
  const stream = Stream.fromByteArray(bytes);
  if (!Decoder.isFIT(stream)) {
    throw new FitFormatError('Not a FIT file');
  }

  const { messages, errors } = new Decoder(stream).read({
    applyScaleAndOffset: true,
    convertDateTimesToDates: true,
    expandComponents: true,
    expandSubFields: true,
    mergeHeartRates: false,
  });

  const records = messages.recordMesgs ?? [];
  if (records.length === 0 && errors.length > 0) {
    throw new FitFormatError(errors[0]?.message ?? 'FIT file could not be decoded');
  }

  const points: GPSPoint[] = [];
  for (const record of records) {
    if (record.positionLat === undefined || record.positionLong === undefined) {
      continue;
    }
    const latitude = semicirclesToDegrees(record.positionLat);
    const longitude = semicirclesToDegrees(record.positionLong);
    if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) {
      continue;
    }
    points.push({
      latitude,
      longitude,
      elevation: finiteOrNull(record.enhancedAltitude) ?? finiteOrNull(record.altitude),
      timestamp: toIso(record.timestamp),
    });
  }

  const session = messages.sessionMesgs?.[0];
  const startTime =
    toIso(session?.startTime) ?? points.find((point) => point.timestamp)?.timestamp ?? null;

  return { name: null, startTime, points };
}

import type { GPSPoint } from '@/types';
import { isValidLatitude, isValidLongitude } from '@/utils/geo';

/** A GPS track read from a file, before normalization (shared by GPX and FIT parsers). */
export interface ParsedTrack {
  readonly name: string | null;
  /** Start time as UTC ISO 8601, or null when the file has none. */
  readonly startTime: string | null;
  /** Valid points only; points with out-of-range or missing coordinates are dropped. */
  readonly points: readonly GPSPoint[];
}

export class GpxFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GpxFormatError';
  }
}

const POINT = /<(?:\w+:)?(?:trkpt|rtept)\b([^>]*?)(\/>|>([\s\S]*?)<\/(?:\w+:)?(?:trkpt|rtept)>)/g;
const ATTRIBUTE = (name: string) => new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`);
const LAT = ATTRIBUTE('lat');
const LON = ATTRIBUTE('lon');
const element = (name: string) =>
  new RegExp(`<(?:\\w+:)?${name}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${name}>`);
const ELE = element('ele');
const TIME = element('time');
const TRK = element('trk');
const METADATA = element('metadata');
const NAME = element('name');

function decodeXmlText(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, '&')
    .trim();
}

function toIsoTime(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(value.trim());
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toNumber(value: string | undefined): number | null {
  if (value === undefined || value.trim() === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Parses a GPX 1.0/1.1 document into a track (BR-05). A small text scanner is used instead of
 * `DOMParser` because `DOMParser` is not available in Web Workers, where imports run (ADR-0004).
 * GPX track and route points are flat, well-defined elements, which keeps this robust.
 *
 * @throws GpxFormatError when the text is not a GPX document.
 */
export function parseGpx(text: string): ParsedTrack {
  if (!/<(?:\w+:)?gpx\b/.test(text)) {
    throw new GpxFormatError('Not a GPX document');
  }

  const points: GPSPoint[] = [];
  for (const match of text.matchAll(POINT)) {
    const attributes = match[1] ?? '';
    const body = match[3] ?? '';
    const latitude = toNumber(LAT.exec(attributes)?.[1]);
    const longitude = toNumber(LON.exec(attributes)?.[1]);
    if (
      latitude === null ||
      longitude === null ||
      !isValidLatitude(latitude) ||
      !isValidLongitude(longitude)
    ) {
      continue;
    }
    points.push({
      latitude,
      longitude,
      elevation: toNumber(ELE.exec(body)?.[1]),
      timestamp: toIsoTime(TIME.exec(body)?.[1]),
    });
  }

  const track = TRK.exec(text)?.[1] ?? '';
  const metadata = METADATA.exec(text)?.[1] ?? '';
  // The track name comes before the first point; don't pick up a <name> inside a waypoint.
  const trackHead = track.split(/<(?:\w+:)?trkseg\b/)[0] ?? '';
  const rawName = NAME.exec(trackHead)?.[1] ?? NAME.exec(metadata)?.[1];
  const name = rawName === undefined ? null : decodeXmlText(rawName) || null;

  const startTime =
    toIsoTime(TIME.exec(metadata)?.[1]) ??
    points.find((point) => point.timestamp)?.timestamp ??
    null;

  return { name, startTime, points };
}
